import { Router } from 'express';
import { requireCsrf, requireDoctor, requireSession } from '../middlewares/auth.js';
import { readSlots, saveWeekly, weeklyAvailability } from '../services/availability.service.js';
const router = Router();
router.get('/doctors/:id/slots', async (req, res) => res.json(await readSlots(req.params.id, req.query)));
router.get('/me/doctor/availability', requireSession, requireDoctor, async (req, res) => res.json(await weeklyAvailability(req.auth.doctorId)));
router.put('/me/doctor/availability', requireSession, requireDoctor, requireCsrf, async (req, res) => res.json(await saveWeekly(req.auth.doctorId, req.body)));
router.get('/me/doctor/planning', requireSession, requireDoctor, async (req, res) => res.json(await readSlots(req.auth.doctorId, req.query, true)));
export default router;
