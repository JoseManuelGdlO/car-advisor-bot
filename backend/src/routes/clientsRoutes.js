import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import { createClient, deleteClient, getClient, listClients, patchClient } from "../controllers/clientsController.js";

export const clientsRoutes = Router();

clientsRoutes.get("/clients", requireUserAuth, listClients);
clientsRoutes.post("/clients", requireUserAuth, createClient);
clientsRoutes.get("/clients/:id", requireUserAuth, getClient);
clientsRoutes.patch("/clients/:id", requireUserAuth, patchClient);
clientsRoutes.delete("/clients/:id", requireUserAuth, deleteClient);
