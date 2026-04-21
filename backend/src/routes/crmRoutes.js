import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { requireServiceToken, requireUserAuth } from "../middlewares/auth.js";
import {
  botUpsertConversation,
  createClient,
  createFaq,
  createPromotion,
  createVehicle,
  deleteFaq,
  getClient,
  getConversationMessages,
  getDashboard,
  listClients,
  listConversations,
  listFaqs,
  listPromotions,
  listVehicles,
  togglePromotion,
  uploadVehicleImages,
  updateFaq,
  updatePromotion,
  updateVehicle,
} from "../controllers/crmController.js";

export const crmRoutes = Router();
const uploadDir = path.resolve(process.cwd(), "autobot");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
  },
});
const upload = multer({ storage });

crmRoutes.get("/dashboard/kpis", requireUserAuth, getDashboard);
crmRoutes.get("/clients", requireUserAuth, listClients);
crmRoutes.post("/clients", requireUserAuth, createClient);
crmRoutes.get("/clients/:id", requireUserAuth, getClient);

crmRoutes.get("/conversations", requireUserAuth, listConversations);
crmRoutes.get("/conversations/:id/messages", requireUserAuth, getConversationMessages);

crmRoutes.get("/vehicles", requireUserAuth, listVehicles);
crmRoutes.post("/vehicles", requireUserAuth, createVehicle);
crmRoutes.patch("/vehicles/:id", requireUserAuth, updateVehicle);
crmRoutes.post("/vehicles/images/upload", requireUserAuth, upload.array("images", 10), uploadVehicleImages);

crmRoutes.get("/faqs", requireUserAuth, listFaqs);
crmRoutes.post("/faqs", requireUserAuth, createFaq);
crmRoutes.patch("/faqs/:id", requireUserAuth, updateFaq);
crmRoutes.delete("/faqs/:id", requireUserAuth, deleteFaq);

crmRoutes.get("/promotions", requireUserAuth, listPromotions);
crmRoutes.post("/promotions", requireUserAuth, createPromotion);
crmRoutes.patch("/promotions/:id", requireUserAuth, updatePromotion);
crmRoutes.post("/promotions/:id/toggle", requireUserAuth, togglePromotion);

crmRoutes.post("/bot/conversation-events", requireServiceToken, botUpsertConversation);
