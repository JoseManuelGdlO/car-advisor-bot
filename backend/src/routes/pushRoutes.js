import { Router } from "express";
import { requireUserAuth, requireUserOrServiceAuth } from "../middlewares/auth.js";
import { registerPushDevice, sendPush, unregisterPushDevice } from "../controllers/pushController.js";

export const pushRoutes = Router();

pushRoutes.post("/push/devices", requireUserAuth, registerPushDevice);
pushRoutes.delete("/push/devices/:token", requireUserAuth, unregisterPushDevice);
pushRoutes.post("/push/send", requireUserOrServiceAuth, sendPush);
