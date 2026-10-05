import { Router } from 'express';
import { getMyPlanning } from '../controllers/planning.controller.js';
import {
  requireDoctor,
  requireSession,
} from '../middlewares/auth.js';

const router = Router();

router.get(
  '/me/doctor/planning',
  requireSession,
  requireDoctor,
  getMyPlanning
);

export default router;