import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { requireUserAuth } from "../middlewares/auth.js";
import {
  getConversationMessages,
  listConversations,
  sendConversationAttachment,
  sendConversationMessage,
  setConversationControl,
} from "../controllers/conversationsController.js";

export const conversationsRoutes = Router();
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

conversationsRoutes.get("/conversations", requireUserAuth, listConversations);
conversationsRoutes.get("/conversations/:id/messages", requireUserAuth, getConversationMessages);
conversationsRoutes.post("/conversations/:id/messages", requireUserAuth, sendConversationMessage);
conversationsRoutes.post("/conversations/:id/attachments", requireUserAuth, upload.single("attachment"), sendConversationAttachment);
conversationsRoutes.patch("/conversations/:id/control", requireUserAuth, setConversationControl);
