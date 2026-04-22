import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import { createPromotion, listPromotions, togglePromotion, updatePromotion } from "../controllers/promotionController.js";

export const promotionRoutes = Router();

promotionRoutes.get("/promotions", requireUserAuth, listPromotions);
promotionRoutes.post("/promotions", requireUserAuth, createPromotion);
promotionRoutes.patch("/promotions/:id", requireUserAuth, updatePromotion);
promotionRoutes.post("/promotions/:id/toggle", requireUserAuth, togglePromotion);
