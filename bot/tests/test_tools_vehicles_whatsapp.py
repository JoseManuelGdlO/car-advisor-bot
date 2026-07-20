"""Tests unitarios de herramientas compartidas: resolución de vehículo y markers de imágenes WhatsApp."""

from __future__ import annotations

import json
import os
from unittest import TestCase
from unittest.mock import patch

from src.tools.vehicles import resolve_single_vehicle_from_text
from src.utils.whatsapp_markers import (
    build_whatsapp_document_marker_block,
    build_whatsapp_image_marker_block,
    normalize_image_url_for_chat,
)


class VehicleResolverTests(TestCase):
    def test_resolver_prefers_available_single_candidate(self) -> None:
        matches = [
            {"id": "veh-1", "status": "reserved"},
            {"id": "veh-2", "status": "available"},
        ]
        with (
            patch("src.tools.vehicles.fetch_vehicles", return_value=[{"id": "veh-2"}]),
            patch("src.tools.vehicles.detect_vehicle_filters", return_value={"model": "versa"}),
            patch("src.tools.vehicles.search_vehicles", return_value=matches),
        ):
            resolved = resolve_single_vehicle_from_text("quiero el versa", prefer_available=True)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.get("id"), "veh-2")

    def test_resolver_picks_preferred_among_same_model_when_enabled(self) -> None:
        matches = [
            {
                "id": "veh-expensive",
                "model": "Dzire",
                "status": "available",
                "price": 320000,
                "outboundPriority": 2,
            },
            {
                "id": "veh-cheap",
                "model": "Dzire",
                "status": "available",
                "price": 300000,
                "outboundPriority": 1,
            },
        ]
        with (
            patch("src.tools.vehicles.fetch_vehicles", return_value=matches),
            patch("src.tools.vehicles.detect_vehicle_filters", return_value={"model": "Dzire"}),
            patch("src.tools.vehicles.search_vehicles", return_value=matches),
        ):
            resolved = resolve_single_vehicle_from_text(
                "quiero el dzire",
                prefer_available=True,
                pick_from_multiple=True,
            )
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.get("id"), "veh-cheap")

    def test_resolver_does_not_pick_across_different_models(self) -> None:
        matches = [
            {"id": "veh-a", "model": "Dzire", "status": "available", "price": 300000},
            {"id": "veh-b", "model": "Swift", "status": "available", "price": 280000},
        ]
        with (
            patch("src.tools.vehicles.fetch_vehicles", return_value=matches),
            patch("src.tools.vehicles.detect_vehicle_filters", return_value={"brand": "Suzuki"}),
            patch("src.tools.vehicles.search_vehicles", return_value=matches),
        ):
            resolved = resolve_single_vehicle_from_text(
                "quiero un suzuki",
                prefer_available=True,
                pick_from_multiple=True,
            )
        self.assertIsNone(resolved)


class WhatsappMarkerHelpersTests(TestCase):
    def test_normalize_image_url_for_chat_builds_absolute_url(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BACKEND_API_URL": "https://api.example.com/api",
                "BACKEND_PUBLIC_URL": "",
                "VEHICLE_IMAGES_PUBLIC_BASE_URL": "",
            },
            clear=False,
        ):
            self.assertEqual(
                normalize_image_url_for_chat("/uploads/cars/versa.jpg"),
                "https://api.example.com/uploads/cars/versa.jpg",
            )

    def test_normalize_image_url_for_chat_prefers_backend_public_url(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BACKEND_API_URL": "http://backend:4000/api",
                "BACKEND_PUBLIC_URL": "https://cdn.example.com",
                "VEHICLE_IMAGES_PUBLIC_BASE_URL": "",
            },
            clear=False,
        ):
            self.assertEqual(
                normalize_image_url_for_chat("/uploads/autobot/ficha.pdf"),
                "https://cdn.example.com/uploads/autobot/ficha.pdf",
            )

    def test_normalize_image_url_for_chat_prefers_vehicle_images_public_base_url(self) -> None:
        with patch.dict(
            os.environ,
            {
                "BACKEND_API_URL": "http://backend:4000/api",
                "BACKEND_PUBLIC_URL": "https://cdn.example.com",
                "VEHICLE_IMAGES_PUBLIC_BASE_URL": "https://media.example.com",
            },
            clear=False,
        ):
            self.assertEqual(
                normalize_image_url_for_chat("/uploads/autobot/ficha.pdf"),
                "https://media.example.com/uploads/autobot/ficha.pdf",
            )

    def test_marker_block_ignores_empty_image_urls(self) -> None:
        fake_messages = [
            {"to": "123", "type": "image", "imageUrl": ""},
            {"to": "123", "type": "image", "imageUrl": "https://cdn.example.com/car.jpg"},
        ]
        with patch("src.utils.whatsapp_markers.build_whatsapp_image_messages", return_value=fake_messages):
            block = build_whatsapp_image_marker_block(to="123", vehicle_id="veh-1")
        self.assertIn("<<WC_IMAGE_JSON>>", block)
        self.assertIn("car.jpg", block)
        self.assertEqual(block.count("<<WC_IMAGE_JSON>>"), 1)

    def test_document_marker_block_builds_valid_json(self) -> None:
        block = build_whatsapp_document_marker_block(
            to="5215512345678",
            document_url="https://api.example.com/uploads/autobot/ficha.pdf",
            file_name="ficha.pdf",
            caption="Aquí tienes la ficha técnica",
        )
        self.assertIn("<<WC_DOCUMENT_JSON>>", block)
        self.assertIn("ficha.pdf", block)
        payload = json.loads(block.replace("<<WC_DOCUMENT_JSON>>", "", 1))
        self.assertEqual(payload["caption"], "Aquí tienes la ficha técnica")

    def test_document_marker_block_returns_empty_without_required_fields(self) -> None:
        self.assertEqual(
            build_whatsapp_document_marker_block(
                to="",
                document_url="https://example.com/ficha.pdf",
                file_name="ficha.pdf",
            ),
            "",
        )
