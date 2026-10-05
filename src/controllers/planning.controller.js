import { getDoctorPlanning } from '../services/planning.service.js';

export async function getMyPlanning(req, res) {
  const planning = await getDoctorPlanning(req.auth.doctorId);

  res.json({ planning });
}