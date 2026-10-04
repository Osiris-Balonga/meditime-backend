import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middlewares/errors.js';
import { lockedDoctor } from './availability.service.js';
import { publicDoctorSelect, uuid } from './doctor.service.js';

const requestInput = z.object({ slotId: uuid, reason: z.string().trim().max(1000).optional() }).strict();
const listInput = z.object({
  status: z.enum(['pending', 'confirmed', 'declined', 'cancelled', 'past']).optional(),
  from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
export const appointmentSelect = {
  id: true, status: true, reason: true, decisionCode: true, createdAt: true, decidedAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  slot: { select: { id: true, startsAt: true, endsAt: true, doctor: { select: publicDoctorSelect } } },
};
export function presentAppointment(request) {
  return { ...request, status: request.status.toLowerCase(), isPast: request.status === 'CONFIRMED' && request.slot.endsAt <= new Date() };
}
export async function expireRequests(db, scope) {
  await db.appointmentRequest.updateMany({ where: { ...scope, status: 'PENDING', slot: { ...(scope.slot ?? {}), startsAt: { lte: new Date() } } }, data: { status: 'CANCELLED', decisionCode: 'REQUEST_EXPIRED', decidedAt: new Date() } });
}
export async function createAppointment(userId, body) {
  const { slotId, reason } = requestInput.parse(body);
  const reference = await prisma.slot.findUnique({ where: { id: slotId }, select: { doctorId: true } });
  if (!reference) throw new HttpError(404, 'SLOT_NOT_FOUND', 'Ce créneau n’existe pas.');
  try {
    return await prisma.$transaction(async tx => {
      const doctor = await lockedDoctor(tx, reference.doctorId);
      const user = await tx.user.findUnique({ where: { id: userId }, select: { profileCompletedAt: true } });
      if (!user?.profileCompletedAt) throw new HttpError(409, 'PROFILE_INCOMPLETE', 'Complétez votre profil avant de demander un rendez-vous.');
      const slot = await tx.slot.findUnique({ where: { id: slotId }, include: { requests: { where: { status: 'CONFIRMED' } } } });
      if (!doctor.published || !slot || slot.startsAt <= new Date() || slot.status !== 'AVAILABLE' || slot.requests.length) throw new HttpError(409, 'SLOT_UNAVAILABLE', 'Ce créneau n’est plus disponible.');
      const duplicate = await tx.appointmentRequest.findFirst({ where: { slotId, patientId: userId, status: { in: ['PENDING', 'CONFIRMED'] } } });
      if (duplicate) throw new HttpError(409, 'DUPLICATE_REQUEST', 'Vous avez déjà une demande active pour ce créneau.');
      return presentAppointment(await tx.appointmentRequest.create({ data: { slotId, patientId: userId, reason: reason || null }, select: appointmentSelect }));
    }, { timeout: 15000 });
  } catch (error) {
    if (error.code === 'P2002') throw new HttpError(409, 'DUPLICATE_REQUEST', 'Vous avez déjà une demande active pour ce créneau.');
    throw error;
  }
}
export async function listAppointments(scope, query) {
  const { status, from, to, page, limit } = listInput.parse(query);
  if (from && to && new Date(from) >= new Date(to)) throw new HttpError(400, 'INVALID_DATE_RANGE', 'La fin doit suivre le début.');
  await expireRequests(prisma, scope);
  const time = { ...(from && { gte: new Date(from) }), ...(to && { lt: new Date(to) }) };
  const where = { ...scope, ...(status && { status: status === 'past' ? 'CONFIRMED' : status.toUpperCase() }), slot: {
    ...(scope.slot ?? {}), ...((from || to) && { startsAt: time }),
    ...(status === 'past' && { endsAt: { lte: new Date() } }), ...(status === 'confirmed' && { endsAt: { gt: new Date() } }),
  } };
  const [appointments, total] = await prisma.$transaction([
    prisma.appointmentRequest.findMany({ where, select: appointmentSelect, orderBy: [{ slot: { startsAt: 'asc' } }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
    prisma.appointmentRequest.count({ where }),
  ]);
  return { appointments: appointments.map(presentAppointment), pagination: { page, limit, total } };
}
export async function appointmentDetail(id, auth) {
  uuid.parse(id);
  const where = { id, OR: [{ patientId: auth.userId }, ...(auth.doctorId ? [{ slot: { doctorId: auth.doctorId } }] : [])] };
  await expireRequests(prisma, where);
  const request = await prisma.appointmentRequest.findFirst({ where, select: appointmentSelect });
  if (!request) throw new HttpError(404, 'APPOINTMENT_NOT_FOUND', 'Cette demande n’est pas accessible.');
  return presentAppointment(request);
}
