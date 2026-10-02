import { Router } from 'express';
import { getMe, getMyDoctorProfile, patchMe, patchMyDoctorProfile } from '../controllers/profile.controller.js';
import { requireCsrf, requireDoctor, requireSession } from '../middlewares/auth.js';
const router = Router();

router.get('/me', requireSession, getMe);
router.patch('/me', requireSession, requireCsrf, patchMe);
router.get('/me/doctor-profile', requireSession, requireDoctor, getMyDoctorProfile);
router.patch('/me/doctor-profile', requireSession, requireDoctor, requireCsrf, patchMyDoctorProfile);

export default router;
