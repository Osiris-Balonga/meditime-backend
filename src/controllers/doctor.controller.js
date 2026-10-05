import { getDoctorSlots as getDoctorSlotsService } from '../services/doctor.service.js';

export async function getDoctorSlots(req, res) {
  const slots = await getDoctorSlotsService(req.params.id);

  res.json({ slots });
}