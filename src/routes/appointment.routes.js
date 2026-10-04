import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js"; // fourni par feature/auth-profiles (#3-#5) : renseigne req.user.id
import * as c from "../controllers/appointment.controller.js";

const router = Router();

// #9 — demandes (patient)
router.post("/appointments", requireAuth, c.create);
router.get("/appointments/me", requireAuth, c.listMine);
router.patch("/appointments/:id/cancel", requireAuth, c.cancel);

// #10 — décisions (médecin approuvé, vérifié dans le service)
router.get("/doctor/appointments", requireAuth, c.listForDoctor);
router.patch("/appointments/:id/confirm", requireAuth, c.decide("confirm"));
router.patch("/appointments/:id/decline", requireAuth, c.decide("decline"));

// #11 — tableaux de bord
router.get("/dashboard/patient", requireAuth, c.patientDashboard);
router.get("/dashboard/doctor", requireAuth, c.doctorDashboard);

export default router;
