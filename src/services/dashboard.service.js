import { DateTime } from 'luxon';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middlewares/errors.js';
import { appointmentSelect, expireRequests, presentAppointment } from './appointment.service.js';

export async function dashboard(auth, query) {
  const { mode } = z.object({ mode: z.enum(['patient', 'doctor']).default('patient') }).strict().parse(query);
  if (mode === 'doctor' && !auth.doctorId) throw new HttpError(403, 'DOCTOR_ACCESS_REQUIRED', 'Ce compte n’a pas d’accès médecin.');
  const doctor = mode === 'doctor' ? await prisma.doctorProfile.findUniqueOrThrow({ where: { id: auth.doctorId }, select: { timezone: true } }) : null;
  const timezone = doctor?.timezone ?? 'Africa/Brazzaville';
  const day = DateTime.now().setZone(timezone).startOf('day');
  const now = new Date();
  const scope = mode === 'doctor' ? { slot: { doctorId: auth.doctorId } } : { patientId: auth.userId };
  await expireRequests(prisma, scope);
  const future = { ...scope, status: 'CONFIRMED', slot: { ...(scope.slot ?? {}), endsAt: { gt: now } } };
  const [pending, confirmed, declined, cancelled, past, today, upcoming] = await prisma.$transaction([
    prisma.appointmentRequest.count({ where: { ...scope, status: 'PENDING' } }),
    prisma.appointmentRequest.count({ where: future }),
    prisma.appointmentRequest.count({ where: { ...scope, status: 'DECLINED' } }),
    prisma.appointmentRequest.count({ where: { ...scope, status: 'CANCELLED' } }),
    prisma.appointmentRequest.count({ where: { ...scope, status: 'CONFIRMED', slot: { ...(scope.slot ?? {}), endsAt: { lte: now } } } }),
    prisma.appointmentRequest.count({ where: { ...scope, status: 'CONFIRMED', slot: { ...(scope.slot ?? {}), startsAt: { gte: day.toUTC().toJSDate(), lt: day.plus({ days: 1 }).toUTC().toJSDate() } } } }),
    prisma.appointmentRequest.findMany({ where: future, select: appointmentSelect, orderBy: [{ slot: { startsAt: 'asc' } }, { id: 'asc' }], take: 5 }),
  ]);
  return { mode, timezone, date: day.toISODate(), counts: { pending, confirmed, declined, cancelled, past, today }, upcoming: upcoming.map(presentAppointment) };
}
