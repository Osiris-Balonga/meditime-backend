import { Router } from 'express';
import authRoutes from './auth.routes.js';
import profileRoutes from './profile.routes.js';
import doctorRoutes from './doctor.routes.js';
import availabilityRoutes from './availability.routes.js';
import appointmentRoutes from './appointment.routes.js';
import dashboardRoutes from './dashboard.routes.js';

const router = Router();
router.use('/auth', authRoutes);
router.use(profileRoutes);
router.use(doctorRoutes);
router.use(availabilityRoutes);
router.use(appointmentRoutes);
router.use(dashboardRoutes);

export default router;
