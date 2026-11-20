import { Router } from "express";
import { requireAdmin, requireUserAuth } from "../middlewares/auth.js";
import {
  createClient,
  deleteClient,
  getClient,
  listClients,
  patchClient,
  patchClientAssignment,
} from "../controllers/clientsController.js";

export const clientsRoutes = Router();

clientsRoutes.get("/clients", requireUserAuth, listClients);
clientsRoutes.post("/clients", requireUserAuth, createClient);
clientsRoutes.get("/clients/:id", requireUserAuth, getClient);
clientsRoutes.patch("/clients/:id", requireUserAuth, patchClient);
// Asignar/reasignar/desasignar vendedor: solo admin.
clientsRoutes.patch("/clients/:id/assignment", requireUserAuth, requireAdmin, patchClientAssignment);
// Eliminar lead: solo admin (el vendedor no puede borrar leads asignados).
clientsRoutes.delete("/clients/:id", requireUserAuth, requireAdmin, deleteClient);
