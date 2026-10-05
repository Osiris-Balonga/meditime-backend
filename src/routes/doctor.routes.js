import { Router } from 'express';
import { getDoctorSlots } from '../controllers/doctor.controller.js';

const router = Router();

router.get('/doctors/:id/slots', getDoctorSlots);

export default router;