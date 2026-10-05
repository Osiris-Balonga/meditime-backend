import { prisma } from '../lib/prisma.js';
import { addException, removeException } from '../services/exception.service.js';
import { dateRange } from '../lib/planning-time.js';
export async function list(req, res) {
  const doctor = await prisma.doctorProfile.findUniqueOrThrow({ where: { id: req.auth.doctorId } });
  const { start, end } = dateRange(req.query, doctor.timezone);
  const items = await prisma.availabilityException.findMany({ where: { doctorId: doctor.id, date: { gte: new Date(start.toISODate() + 'T00:00:00Z'), lt: new Date(end.toISODate() + 'T00:00:00Z') } }, orderBy: { date: 'asc' } });
  res.json({ data: { items } });
}
export async function create(req, res) { res.status(201).json({ data: await addException(req.auth.doctorId, req.body) }); }
export async function remove(req, res) { await removeException(req.auth.doctorId, req.params.id); res.json({ data: { id: req.params.id, deleted: true } }); }
