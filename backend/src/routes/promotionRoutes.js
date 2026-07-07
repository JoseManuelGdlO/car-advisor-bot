import { Router } from "express";
import { requireUserAuth, requireUserOrServiceAuth } from "../middlewares/auth.js";
import {
  createPromotion,
  deletePromotion,
  getPromotionsByVehicleId,
  listPromotions,
  togglePromotion,
  updatePromotion,
} from "../controllers/promotionController.js";

export const promotionRoutes = Router();

promotionRoutes.get("/promotions", requireUserOrServiceAuth, listPromotions);
promotionRoutes.get("/vehicles/:vehicleId/promotions", requireUserOrServiceAuth, getPromotionsByVehicleId);
promotionRoutes.post("/promotions", requireUserAuth, createPromotion);
promotionRoutes.patch("/promotions/:id", requireUserAuth, updatePromotion);
promotionRoutes.delete("/promotions/:id", requireUserAuth, deletePromotion);
promotionRoutes.post("/promotions/:id/toggle", requireUserAuth, togglePromotion);
