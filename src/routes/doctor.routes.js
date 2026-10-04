import { Router } from 'express';
import { doctorDetail, listSpecialties, searchDoctors } from '../services/doctor.service.js';
const router = Router();
router.get('/specialties', async (req, res) => res.json({ specialties: await listSpecialties() }));
router.get('/doctors', async (req, res) => res.json(await searchDoctors(req.query)));
router.get('/doctors/:id', async (req, res) => res.json({ doctor: await doctorDetail(req.params.id) }));
export default router;
