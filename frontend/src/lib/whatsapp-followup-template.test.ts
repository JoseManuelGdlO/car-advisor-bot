import { describe, expect, it } from "vitest";
import {
  followupBodyError,
  META_FOLLOWUP_OUTSIDE_WINDOW_NOTE,
  META_RESUBMIT_TITLE,
  META_RESUBMIT_WARNING,
  META_TEMPLATE_PENDING_EDIT_HINT,
  metaTemplateStatusHint,
  shouldConfirmMetaResubmit,
  STATUS_BADGE_LABELS,
} from "./whatsapp-followup-template";

describe("STATUS_BADGE_LABELS", () => {
  it("usa las etiquetas en español del spec", () => {
    expect(STATUS_BADGE_LABELS.PENDING).toBe("En revisión");
    expect(STATUS_BADGE_LABELS.APPROVED).toBe("Aprobada");
    expect(STATUS_BADGE_LABELS.REJECTED).toBe("Rechazada");
    expect(STATUS_BADGE_LABELS.PAUSED).toBe("Pausada");
    expect(STATUS_BADGE_LABELS.DISABLED).toBe("Pausada");
  });
});

describe("shouldConfirmMetaResubmit", () => {
  it("pide confirmación al reenviar plantillas ya respondidas por Meta", () => {
    expect(shouldConfirmMetaResubmit("APPROVED")).toBe(true);
    expect(shouldConfirmMetaResubmit("REJECTED")).toBe(true);
    expect(shouldConfirmMetaResubmit("PAUSED")).toBe(true);
    expect(shouldConfirmMetaResubmit("DISABLED")).toBe(true);
  });

  it("no pide confirmación si está en revisión o no hay status", () => {
    expect(shouldConfirmMetaResubmit("PENDING")).toBe(false);
    expect(shouldConfirmMetaResubmit(null)).toBe(false);
    expect(shouldConfirmMetaResubmit(undefined)).toBe(false);
  });
});

describe("followupBodyError", () => {
  it("rechaza el cuerpo vacío", () => {
    expect(followupBodyError("")).toBe("El cuerpo no puede estar vacío.");
    expect(followupBodyError("   ")).toBe("El cuerpo no puede estar vacío.");
  });

  it("rechaza variables {{n}}", () => {
    expect(followupBodyError("Hola {{1}}, ¿sigues interesado?")).toBe(
      "Esta plantilla es solo texto. No uses variables como {{1}}.",
    );
  });

  it("acepta texto plano", () => {
    expect(followupBodyError("Hola, ¿sigues ahí?")).toBeNull();
  });
});

describe("metaTemplateStatusHint", () => {
  it("explica que PENDING no sirve fuera de 24 h", () => {
    expect(metaTemplateStatusHint("PENDING")).toBe(
      "En revisión de Meta. No se puede usar en recordatorios fuera de 24 h hasta que la aprueben.",
    );
  });
});

describe("ventana de 24 h", () => {
  it("explica que fuera de 24 h no viaja la última pregunta", () => {
    expect(META_FOLLOWUP_OUTSIDE_WINDOW_NOTE).toBe(
      "Dentro de 24 h el recordatorio se envía junto con la última pregunta del bot. Fuera de 24 h el cliente solo recibe el texto de la plantilla, sin esa pregunta.",
    );
  });
});

describe("copy de reenvío", () => {
  it("usa el título, aviso y hint de edición en revisión del spec", () => {
    expect(META_RESUBMIT_TITLE).toBe("¿Seguro que quieres mandar esta plantilla a revisión?");
    expect(META_RESUBMIT_WARNING).toBe(
      "Quedará deshabilitada para los recordatorios de WhatsApp hasta que Meta la apruebe otra vez. Suele tardar alrededor de un día.",
    );
    expect(META_TEMPLATE_PENDING_EDIT_HINT).toBe("No se puede editar una plantilla en revisión");
  });
});
