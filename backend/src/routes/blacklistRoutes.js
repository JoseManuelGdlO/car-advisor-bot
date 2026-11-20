import { Router } from "express";
import { requireAdmin, requireUserAuth } from "../middlewares/auth.js";
import {
  createBlacklistEntry,
  deleteBlacklistEntry,
  listBlacklist,
} from "../controllers/blacklistController.js";

export const blacklistRoutes = Router();

blacklistRoutes.get("/blacklist", requireUserAuth, requireAdmin, listBlacklist);
blacklistRoutes.post("/blacklist", requireUserAuth, requireAdmin, createBlacklistEntry);
blacklistRoutes.delete("/blacklist/:id", requireUserAuth, requireAdmin, deleteBlacklistEntry);
