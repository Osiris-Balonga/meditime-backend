import { Router } from "express";
import {
  requireSession,
  requireDoctor,
  requireCsrf,
} from "../middlewares/auth.js";
import * as c from "../controllers/availability.controller.js";

const router = Router();

// #8 — exceptions ponctuelles du planning (médecin approuvé)
router.get("/doctor/exceptions", requireSession, requireDoctor, c.list);
router.post(
  "/doctor/exceptions",
  requireSession,
  requireDoctor,
  requireCsrf,
  c.create,
);
router.delete(
  "/doctor/exceptions/:id",
  requireSession,
  requireDoctor,
  requireCsrf,
  c.remove,
);

export default router;
