import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import { createClient, getClient, listClients } from "../controllers/clientsController.js";

export const clientsRoutes = Router();

clientsRoutes.get("/clients", requireUserAuth, listClients);
clientsRoutes.post("/clients", requireUserAuth, createClient);
clientsRoutes.get("/clients/:id", requireUserAuth, getClient);
