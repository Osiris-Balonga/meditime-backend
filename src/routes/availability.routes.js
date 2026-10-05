import { Router } from 'express';
import {
  getMyAvailability,
  updateMyAvailability,
} from '../controllers/availability.controller.js';
import {
  requireCsrf,
  requireDoctor,
  requireSession,
} from '../middlewares/auth.js';

const router = Router();

router.get(
  '/me/doctor/availability',
  requireSession,
  requireDoctor,
  getMyAvailability
);

router.put(
  '/me/doctor/availability',
  requireSession,
  requireDoctor,
  requireCsrf,
  updateMyAvailability
);

export default router;