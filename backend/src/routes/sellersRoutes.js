import { Router } from "express";
import { requireAdmin, requireUserAuth } from "../middlewares/auth.js";
import {
  createSellerHandler,
  deleteSellerHandler,
  getSellerHandler,
  listSellersHandler,
  patchSellerHandler,
  patchSellerLeadScheduleHandler,
  restoreSellerHandler,
} from "../controllers/sellersController.js";

export const sellersRoutes = Router();

sellersRoutes.get("/sellers", requireUserAuth, requireAdmin, listSellersHandler);
sellersRoutes.post("/sellers", requireUserAuth, requireAdmin, createSellerHandler);
sellersRoutes.get("/sellers/:id", requireUserAuth, requireAdmin, getSellerHandler);
sellersRoutes.patch("/sellers/:id", requireUserAuth, requireAdmin, patchSellerHandler);
sellersRoutes.patch("/sellers/:id/lead-schedule", requireUserAuth, requireAdmin, patchSellerLeadScheduleHandler);
// Baja lógica (active=false): nunca borra la fila.
sellersRoutes.delete("/sellers/:id", requireUserAuth, requireAdmin, deleteSellerHandler);
sellersRoutes.post("/sellers/:id/restore", requireUserAuth, requireAdmin, restoreSellerHandler);
