
import {
  getDoctorAvailability,
  updateDoctorAvailability,
} from '../services/availability.service.js';

export async function getMyAvailability(req, res) {
  const availability = await getDoctorAvailability(req.auth.doctorId);

  res.json({ availability });
}

export async function updateMyAvailability(req, res) {
  const availability = await updateDoctorAvailability(
    req.auth.doctorId,
    req.body
  );

  res.json({ availability });
}