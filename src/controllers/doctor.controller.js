import { doctorDetail, searchDoctors, listSpecialties } from '../services/doctor.service.js';
import { readSlots } from '../services/availability.service.js';
export async function specialties(req, res) { res.json({ specialties: await listSpecialties() }); }
export async function search(req, res) { res.json(await searchDoctors(req.query)); }
export async function profile(req, res) { res.json({ doctor: await doctorDetail(req.params.id) }); }
export async function slots(req, res) { res.json(await readSlots(req.params.id, req.query)); }
