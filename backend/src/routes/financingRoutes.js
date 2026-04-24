import { Router } from "express";
import { requireUserAuth, requireUserOrServiceAuth } from "../middlewares/auth.js";
import {
  getFinancingPlanByVehicleId,
  attachPlanToVehicle,
  attachRequirementToPlan,
  createFinancingPlan,
  createFinancingRequirement,
  deleteFinancingPlan,
  deleteFinancingRequirement,
  detachPlanFromVehicle,
  detachRequirementFromPlan,
  listFinancingPlans,
  listFinancingRequirements,
  updateFinancingPlan,
  updateFinancingRequirement,
} from "../controllers/financingController.js";

export const financingRoutes = Router();

financingRoutes.get("/financing-plans", requireUserOrServiceAuth, listFinancingPlans);
financingRoutes.get("/vehicles/:vehicleId/financing-plans", requireUserOrServiceAuth, getFinancingPlanByVehicleId);
financingRoutes.get("/financing-plans/:id", requireUserOrServiceAuth, getFinancingPlanByVehicleId);
financingRoutes.post("/financing-plans", requireUserAuth, createFinancingPlan);
financingRoutes.patch("/financing-plans/:id", requireUserAuth, updateFinancingPlan);
financingRoutes.delete("/financing-plans/:id", requireUserAuth, deleteFinancingPlan);

financingRoutes.get("/financing-requirements", requireUserAuth, listFinancingRequirements);
financingRoutes.post("/financing-requirements", requireUserAuth, createFinancingRequirement);
financingRoutes.patch("/financing-requirements/:id", requireUserAuth, updateFinancingRequirement);
financingRoutes.delete("/financing-requirements/:id", requireUserAuth, deleteFinancingRequirement);

financingRoutes.post("/vehicles/:vehicleId/financing-plans/:planId", requireUserAuth, attachPlanToVehicle);
financingRoutes.delete("/vehicles/:vehicleId/financing-plans/:planId", requireUserAuth, detachPlanFromVehicle);

financingRoutes.post("/financing-plans/:planId/requirements/:requirementId", requireUserAuth, attachRequirementToPlan);
financingRoutes.delete("/financing-plans/:planId/requirements/:requirementId", requireUserAuth, detachRequirementFromPlan);
