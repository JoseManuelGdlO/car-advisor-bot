#!/usr/bin/env python3
"""Extrae datos técnicos e imagen de portada de fichas PDF Suzuki."""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

import fitz

OWNER_USER_ID = "bab219f0-9e32-4416-a4f5-a9790bbc1499"
BRAND = "Suzuki"
FIELD_LIMITS = {
    "brand": 80,
    "model": 80,
    "engine": 80,
    "color": 80,
    "transmission": 40,
}

COLOR_LINE_RE = re.compile(
    r"^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ,.'-]+\.?$"
)
SKIP_COLOR_LINES = {
    "co2",
    "modelo",
    "ciudad",
    "carretera",
    "combinado",
    "para",
    "gls",
    "glx",
    "tm",
    "ta",
    "cvt",
    "s",
    "n",
    "fox",
    "racoon",
    "dimensiones",
    "seguridad",
    "confort",
    "versión",
    "version",
    "motor",
    "rendimiento",
}


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug or "vehicle"


def truncate(value: str, field: str, source_pdf: str, limit: int | None = None) -> str:
    max_len = limit if limit is not None else FIELD_LIMITS.get(field, 80)
    if len(value) <= max_len:
        return value
    print(
        f"  [warn] {source_pdf}: truncando {field} ({len(value)} -> {max_len} chars)",
        file=sys.stderr,
    )
    return value[:max_len]


def _normalize_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def abbreviate_single_transmission(text: str) -> str:
    lowered = _normalize_accents(text).lower()
    speed_match = re.search(r"(\d+)\s*velocidades?", lowered)
    speeds = speed_match.group(1) if speed_match else "?"

    if "cvt" in lowered:
        return "CVT"
    if re.search(r"(autom|ta\b|\(ta\))", lowered):
        return f"TA {speeds} vel"
    if re.search(r"(manual|tm\b|\(tm\))", lowered):
        return f"TM {speeds} vel"
    return truncate(text, "transmission", "transmission", FIELD_LIMITS["transmission"])


def fit_transmission(raw: str, source_pdf: str) -> tuple[str, str | None]:
    """Devuelve valor para DB (<=40) y texto completo si hubo abreviación."""
    if len(raw) <= FIELD_LIMITS["transmission"]:
        return raw, None

    parts = [part.strip() for part in re.split(r"\s*/\s*", raw) if part.strip()]
    abbreviated = " / ".join(abbreviate_single_transmission(part) for part in parts)
    if len(abbreviated) <= FIELD_LIMITS["transmission"]:
        return abbreviated, raw

    shortened = truncate(
        abbreviated,
        "transmission",
        source_pdf,
        FIELD_LIMITS["transmission"],
    )
    return shortened, raw


def extract_field_value(text: str, label: str) -> str | None:
    pattern = re.compile(rf"^{re.escape(label)}\s*:?\s*(.+)$", re.MULTILINE | re.IGNORECASE)
    match = pattern.search(text)
    if not match:
        return None
    return match.group(1).strip().rstrip(".")


def extract_model(text: str, pdf_stem: str) -> str | None:
    for line in text.splitlines():
        cleaned = line.strip()
        if re.match(r"^[A-Z0-9][A-Z0-9 \-/'\.]+ \d{4}$", cleaned):
            return cleaned

    disclaimer = re.search(
        r"especificaciones aplican para (.+?) y pueden cambiar",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if disclaimer:
        model = re.sub(r"\s+", " ", disclaimer.group(1)).strip()
        if model:
            return model

    return pdf_stem.strip() or None


def extract_year(text: str, model: str | None, pdf_stem: str) -> int | None:
    for source in (model or "", pdf_stem, text):
        match = re.search(r"\b(20\d{2})\b", source)
        if match:
            return int(match.group(1))
    return None


def is_color_line(line: str) -> bool:
    cleaned = line.strip()
    if not cleaned or len(cleaned) < 3 or len(cleaned) > 45:
        return False
    if cleaned.isdigit() or re.fullmatch(r"[\d,.\s]+", cleaned):
        return False
    if cleaned.lower() in SKIP_COLOR_LINES:
        return False
    if cleaned.startswith("http") or cleaned.lower().startswith("para "):
        return False
    if re.search(r"\d", cleaned):
        return False
    if re.search(r"\b(TM|TA|CVT|4WD|2WD|PTAS|BOOSTER|JIMNY|SWIFT|DZIRE|ERTIGA|FRONX|XL7)\b", cleaned, re.I):
        return False
    if re.search(
        r"\b(km/lt|mm\.|hp|rpm|suzuki|@|revisar|criterio|rendimiento|visita|modelo)\b",
        cleaned,
        re.I,
    ):
        return False
    if not COLOR_LINE_RE.match(cleaned):
        return False
    if cleaned.isupper() and " " not in cleaned:
        return False
    return True


def normalize_color(line: str) -> str:
    color = line.strip().rstrip(".")
    return re.sub(r"\s+", " ", color)


def extract_first_color(text: str) -> str | None:
    colors_idx = text.upper().find("COLORES")
    if colors_idx < 0:
        return None

    section = text[colors_idx + len("COLORES") :]
    stop_match = re.search(r"\nPara revisar\b", section, re.IGNORECASE)
    if stop_match:
        section = section[: stop_match.start()]

    pending_prefix: str | None = None
    for raw_line in section.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if is_color_line(line):
            color = normalize_color(line)
            if pending_prefix and len(pending_prefix) <= 12:
                color = f"{pending_prefix} {color}"
            return color
        if len(line) <= 12 and line[0].isupper() and line.isalpha():
            pending_prefix = line
            continue
        pending_prefix = None

    # Algunas fichas (p. ej. JIMNY 3 puertas) listan colores más abajo en la página.
    tail = text[colors_idx + len("COLORES") :]
    for raw_line in tail.splitlines():
        line = raw_line.strip()
        if is_color_line(line):
            return normalize_color(line)

    return None


def extract_transmissions(text: str) -> str | None:
    transmissions: list[str] = []
    seen: set[str] = set()
    for match in re.finditer(r"^Transmisión\s+(.+)$", text, re.MULTILINE | re.IGNORECASE):
        value = match.group(1).strip().rstrip(".")
        key = value.lower()
        if key not in seen:
            seen.add(key)
            transmissions.append(value)
    if not transmissions:
        return None
    return " / ".join(transmissions)


def extract_engine(text: str) -> str | None:
    engine_type = extract_field_value(text, "Tipo")
    displacement = extract_field_value(text, "Desplazamiento")
    if engine_type and displacement:
        return f"{engine_type}, {displacement}"
    return engine_type or displacement


def extract_dimensions(text: str) -> dict[str, int]:
    mapping = {
        "lengthMm": "Longitud total",
        "widthMm": "Ancho total",
        "heightMm": "Altura total",
        "wheelbaseMm": "Distancia entre ejes",
    }
    metadata: dict[str, int] = {}
    for key, label in mapping.items():
        raw = extract_field_value(text, label)
        if not raw:
            continue
        digits = re.sub(r"[^\d]", "", raw)
        if digits:
            metadata[key] = int(digits)
    return metadata


def extract_fuel_efficiency(text: str) -> dict[str, float]:
    metadata: dict[str, float] = {}
    patterns = {
        "fuelCityKmL": r"Rendimiento de combustible en ciudad:\s*([\d.]+)",
        "fuelHighwayKmL": r"Rendimiento de combustible en carretera:\s*([\d.]+)",
        "fuelCombinedKmL": r"Rendimiento de combustible (?:en )?combinado:\s*([\d.]+)",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            metadata[key] = float(match.group(1))
    return metadata


def extract_passengers(text: str) -> int | None:
    match = re.search(
        r"(?:Número|Numero) de pasajeros:\s*(\d+)",
        text,
        re.IGNORECASE,
    )
    return int(match.group(1)) if match else None


def extract_versions(text: str) -> list[str]:
    versions: list[str] = []
    version_match = re.search(r"Versión\s+(.+?)\s+Nota:", text, re.IGNORECASE | re.DOTALL)
    if version_match:
        raw = re.sub(r"\s+", " ", version_match.group(1)).strip()
        if raw:
            versions.append(raw)
    for label in re.findall(r"\b(GLS|GLX|BOOSTERJET GLX|TA 6 VEL|TM5|CVT)\b", text):
        if label not in versions:
            versions.append(label)
    return versions


def parse_specs(text: str, pdf_stem: str) -> dict:
    model = extract_model(text, pdf_stem)
    year = extract_year(text, model, pdf_stem)
    color = extract_first_color(text)
    transmission = extract_transmissions(text)
    engine = extract_engine(text)

    metadata: dict[str, object] = {}
    metadata.update(extract_dimensions(text))
    metadata.update(extract_fuel_efficiency(text))
    passengers = extract_passengers(text)
    if passengers is not None:
        metadata["passengers"] = passengers
    versions = extract_versions(text)
    if versions:
        metadata["versions"] = versions

    db_transmission = transmission
    transmission_full: str | None = None
    if transmission:
        db_transmission, transmission_full = fit_transmission(transmission, pdf_stem)
        if transmission_full:
            metadata["transmissionFull"] = transmission_full

    return {
        "model": model,
        "year": year,
        "color": color,
        "transmission": db_transmission,
        "engine": engine,
        "metadata": metadata,
    }


def export_cover_image(doc: fitz.Document, images_dir: Path, slug: str) -> str:
    images_dir.mkdir(parents=True, exist_ok=True)
    filename = f"suzuki-{slug}.jpg"
    output_path = images_dir / filename
    page = doc[0]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    pixmap.save(str(output_path), output="jpeg", jpg_quality=90)
    return f"/uploads/autobot/{filename}"


def build_record(pdf_path: Path, images_dir: Path) -> dict:
    pdf_stem = pdf_path.stem
    slug = slugify(pdf_stem)

    doc = fitz.open(pdf_path)
    if doc.page_count < 2:
        doc.close()
        return {
            "sourcePdf": pdf_path.name,
            "skipped": True,
            "skipReason": "PDF sin segunda página de especificaciones",
        }

    image_url = export_cover_image(doc, images_dir, slug)
    specs_text = doc[1].get_text("text")
    doc.close()

    specs = parse_specs(specs_text, pdf_stem)
    required = ("model", "year", "color", "transmission", "engine")
    missing = [field for field in required if not specs.get(field)]

    record = {
        "sourcePdf": pdf_path.name,
        "brand": BRAND,
        "model": truncate(specs["model"], "model", pdf_path.name) if specs.get("model") else None,
        "year": specs.get("year"),
        "price": 0,
        "km": 0,
        "color": truncate(specs["color"], "color", pdf_path.name) if specs.get("color") else None,
        "engine": truncate(specs["engine"], "engine", pdf_path.name) if specs.get("engine") else None,
        "transmission": (
            truncate(specs["transmission"], "transmission", pdf_path.name)
            if specs.get("transmission")
            else None
        ),
        "imageUrl": image_url,
        "metadata": specs.get("metadata") or {},
        "ownerUserId": OWNER_USER_ID,
        "skipped": bool(missing),
    }
    if missing:
        record["skipReason"] = f"Campos faltantes: {', '.join(missing)}"
        print(f"  [warn] {pdf_path.name}: {record['skipReason']}", file=sys.stderr)
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description="Extrae datos de fichas técnicas Suzuki (PDF).")
    parser.add_argument(
        "--input",
        default="/Users/intelekia/Downloads/suzuki_cars",
        help="Carpeta con archivos PDF",
    )
    parser.add_argument(
        "--images-dir",
        default="backend/autobot",
        help="Directorio de salida para imágenes de portada",
    )
    parser.add_argument(
        "--manifest",
        default="backend/scripts/.suzuki-import/manifest.json",
        help="Ruta del manifest JSON de salida",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    input_dir = Path(args.input)
    images_dir = Path(args.images_dir)
    if not images_dir.is_absolute():
        images_dir = repo_root / images_dir

    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = repo_root / manifest_path

    if not input_dir.is_dir():
        print(f"Error: carpeta no encontrada: {input_dir}", file=sys.stderr)
        return 1

    pdf_files = sorted(input_dir.glob("*.pdf"))
    if not pdf_files:
        print(f"Error: no hay PDFs en {input_dir}", file=sys.stderr)
        return 1

    records: list[dict] = []
    for pdf_path in pdf_files:
        print(f"Procesando {pdf_path.name}...")
        records.append(build_record(pdf_path, images_dir))

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    ok = sum(1 for r in records if not r.get("skipped"))
    skipped = len(records) - ok
    print(f"\nManifest: {manifest_path}")
    print(f"Registros listos: {ok} | omitidos: {skipped} | total: {len(records)}")
    return 0 if ok > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
