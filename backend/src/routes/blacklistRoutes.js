import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import {
  createBlacklistEntry,
  deleteBlacklistEntry,
  listBlacklist,
} from "../controllers/blacklistController.js";

export const blacklistRoutes = Router();

blacklistRoutes.get("/blacklist", requireUserAuth, listBlacklist);
blacklistRoutes.post("/blacklist", requireUserAuth, createBlacklistEntry);
blacklistRoutes.delete("/blacklist/:id", requireUserAuth, deleteBlacklistEntry);
