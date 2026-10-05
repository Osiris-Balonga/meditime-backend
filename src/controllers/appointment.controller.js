import { cancelRequest, listAppointments } from '../services/appointment.service.js';
import { decideAppointment } from '../services/doctor-decision.service.js';
import { dashboard } from '../services/dashboard.service.js';
const legacyList = result => ({ items: result.appointments, ...result.pagination });
export async function listMine(req, res) { res.json({ data: legacyList(await listAppointments({ patientId: req.auth.userId }, req.query)) }); }
export async function listForDoctor(req, res) { res.json({ data: legacyList(await listAppointments({ slot: { doctorId: req.auth.doctorId } }, req.query)) }); }
export async function cancel(req, res) { res.json({ appointment: await cancelRequest(req.auth.userId, req.params.id) }); }
export const decide = choice => async (req, res) => { res.json({ data: await decideAppointment(req.auth.doctorId, req.params.id, choice === 'confirm', req.body) }); };
export async function patientDashboard(req, res) { res.json({ data: await dashboard(req.auth, { mode: 'patient' }) }); }
export async function doctorDashboard(req, res) { res.json({ data: await dashboard(req.auth, { mode: 'doctor' }) }); }
