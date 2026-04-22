import { Router } from "express";
import { faqRoutes } from "./faqRoutes.js";
import { promotionRoutes } from "./promotionRoutes.js";

export const contentRoutes = Router();

contentRoutes.use("/", faqRoutes);
contentRoutes.use("/", promotionRoutes);
