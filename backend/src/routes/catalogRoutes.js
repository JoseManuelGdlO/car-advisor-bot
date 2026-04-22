import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { requireUserAuth } from "../middlewares/auth.js";
import { createVehicle, listVehicles, updateVehicle, uploadVehicleImages } from "../controllers/catalogController.js";

export const catalogRoutes = Router();

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

catalogRoutes.get("/vehicles", requireUserAuth, listVehicles);
catalogRoutes.post("/vehicles", requireUserAuth, createVehicle);
catalogRoutes.patch("/vehicles/:id", requireUserAuth, updateVehicle);
catalogRoutes.post("/vehicles/images/upload", requireUserAuth, upload.array("images", 10), uploadVehicleImages);
