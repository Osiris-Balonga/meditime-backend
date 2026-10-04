import { Router } from "express";
import {
  requireSession,
  requireDoctor,
  requireCsrf,
} from "../middlewares/auth.js";
import * as c from "../controllers/appointment.controller.js";

const router = Router();

// #9 — demandes (patient connecté)
router.post("/appointments", requireSession, requireCsrf, c.create);
router.get("/appointments/me", requireSession, c.listMine);
router.patch("/appointments/:id/cancel", requireSession, requireCsrf, c.cancel);

// #10 — décisions (médecin approuvé)
router.get(
  "/doctor/appointments",
  requireSession,
  requireDoctor,
  c.listForDoctor,
);
router.patch(
  "/appointments/:id/confirm",
  requireSession,
  requireDoctor,
  requireCsrf,
  c.decide("confirm"),
);
router.patch(
  "/appointments/:id/decline",
  requireSession,
  requireDoctor,
  requireCsrf,
  c.decide("decline"),
);

// #11 — tableaux de bord
router.get("/dashboard/patient", requireSession, c.patientDashboard);
router.get(
  "/dashboard/doctor",
  requireSession,
  requireDoctor,
  c.doctorDashboard,
);

export default router;
