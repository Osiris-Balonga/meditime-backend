import { accountResponse } from '../services/session.service.js';
import { getDoctorProfile, updateDoctorProfile, updateProfile } from '../services/profile.service.js';

export function getMe(req, res) {
  res.json({ ...accountResponse(req.user), csrfToken: req.auth.csrfToken });
}

export async function patchMe(req, res) {
  const user = await updateProfile(req.auth.userId, req.body);
  res.json({ ...accountResponse(user), csrfToken: req.auth.csrfToken });
}

export async function getMyDoctorProfile(req, res) {
  res.json({ doctorProfile: await getDoctorProfile(req.auth.doctorId) });
}

export async function patchMyDoctorProfile(req, res) {
  res.json({ doctorProfile: await updateDoctorProfile(req.auth.doctorId, req.body) });
}
