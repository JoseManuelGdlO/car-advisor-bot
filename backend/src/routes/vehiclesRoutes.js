import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { requireUserAuth, requireUserOrServiceAuth } from "../middlewares/auth.js";
import {
  createVehicle,
  getVehicleById,
  getVehicleImages,
  getVehiclesByFilters,
  listVehicles,
  updateVehicle,
  uploadVehicleImages,
} from "../controllers/vehiclesController.js";

export const vehiclesRoutes = Router();

const uploadDir = path.resolve(process.cwd(), "autobot");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
  },
});
const upload = multer({ storage });

vehiclesRoutes.get("/vehicles", requireUserOrServiceAuth, listVehicles);
vehiclesRoutes.get("/vehicles/search", requireUserOrServiceAuth, getVehiclesByFilters);
vehiclesRoutes.get("/vehicles/:id", requireUserOrServiceAuth, getVehicleById);
vehiclesRoutes.get("/vehicles/:id/images", requireUserOrServiceAuth, getVehicleImages);
vehiclesRoutes.post("/vehicles", requireUserAuth, createVehicle);
vehiclesRoutes.patch("/vehicles/:id", requireUserAuth, updateVehicle);
vehiclesRoutes.post("/vehicles/images/upload", requireUserAuth, upload.array("images", 10), uploadVehicleImages);
