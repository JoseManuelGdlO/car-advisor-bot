import { Router } from "express";
import { requireUserAuth } from "../middlewares/auth.js";
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notificationController.js";

export const notificationRoutes = Router();

notificationRoutes.get("/notifications", requireUserAuth, listNotifications);
notificationRoutes.post("/notifications/mark-all-read", requireUserAuth, markAllNotificationsRead);
notificationRoutes.patch("/notifications/:id/read", requireUserAuth, markNotificationRead);
notificationRoutes.delete("/notifications/:id", requireUserAuth, deleteNotification);
