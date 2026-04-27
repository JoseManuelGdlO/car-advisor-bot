import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import { postWhatsappConnectQrLink } from "../controllers/whatsappConnectController.js";

export const whatsappConnectRoutes = Router();

// Endpoint interno: genera un link publico para escanear QR sin exponer credenciales WC al frontend.
whatsappConnectRoutes.post("/internal/whatsapp/qr-link", requireUserAuth, postWhatsappConnectQrLink);
