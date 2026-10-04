import { Router } from 'express';
import { requireCsrf, requireSession } from '../middlewares/auth.js';
import { appointmentDetail, createAppointment, listAppointments } from '../services/appointment.service.js';
const router = Router();
router.post('/appointments', requireSession, requireCsrf, async (req, res) => res.status(201).json({ appointment: await createAppointment(req.auth.userId, req.body) }));
router.get('/me/appointments', requireSession, async (req, res) => res.json(await listAppointments({ patientId: req.auth.userId }, req.query)));
router.get('/appointments/:id', requireSession, async (req, res) => res.json({ appointment: await appointmentDetail(req.params.id, req.auth) }));
export default router;
