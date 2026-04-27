import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import {
  getWhatsappConnectDeviceStatus,
  postWhatsappConnectQrLink,
  postWhatsappConnectSendTest,
} from "../controllers/whatsappConnectController.js";

export const whatsappConnectRoutes = Router();

// Endpoint interno: genera un link publico para escanear QR sin exponer credenciales WC al frontend.
whatsappConnectRoutes.post("/internal/whatsapp/qr-link", requireUserAuth, postWhatsappConnectQrLink);
// Endpoint interno para monitorear salud/conectividad del device vinculado.
whatsappConnectRoutes.get("/internal/whatsapp/device-status", requireUserAuth, getWhatsappConnectDeviceStatus);
// Endpoint interno para envío de prueba manual desde UI.
whatsappConnectRoutes.post("/internal/whatsapp/send-test", requireUserAuth, postWhatsappConnectSendTest);
