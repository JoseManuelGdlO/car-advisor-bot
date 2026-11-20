import { Router } from "express";
import { requireAdmin, requireUserAuth } from "../middlewares/auth.js";
import { createFaq, deleteFaq, listFaqs, updateFaq } from "../controllers/faqController.js";

export const faqRoutes = Router();

faqRoutes.get("/faqs", requireUserAuth, requireAdmin, listFaqs);
faqRoutes.post("/faqs", requireUserAuth, requireAdmin, createFaq);
faqRoutes.patch("/faqs/:id", requireUserAuth, requireAdmin, updateFaq);
faqRoutes.delete("/faqs/:id", requireUserAuth, requireAdmin, deleteFaq);
