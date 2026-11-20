import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import { createFaq, deleteFaq, listFaqs, updateFaq } from "../controllers/faqController.js";

export const faqRoutes = Router();

faqRoutes.get("/faqs", requireUserAuth, listFaqs);
faqRoutes.post("/faqs", requireUserAuth, createFaq);
faqRoutes.patch("/faqs/:id", requireUserAuth, updateFaq);
faqRoutes.delete("/faqs/:id", requireUserAuth, deleteFaq);
