import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as c from "../controllers/doctor.controller.js";

const router = Router();

// Endpoints publics : limités par IP pour éviter le moissonnage.
const publicLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Trop de demandes. Réessayez plus tard.",
    },
  },
});

// #6 — recherche et consultation
router.get("/specialties", publicLimit, c.specialties);
router.get("/doctors", publicLimit, c.search);
router.get("/doctors/:id", publicLimit, c.profile);
router.get("/doctors/:id/slots", publicLimit, c.slots);

export default router;
