import { DateTime } from 'luxon';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { dayInZone, dateInput } from '../lib/planning-time.js';
import { lockedDoctor, reconcileSlots } from './availability.service.js';
import { HttpError } from '../middlewares/errors.js';

const minute = z.number().int().min(0).max(1440);
const exceptionInput = z.object({ date: dateInput, type: z.enum(['BLOCK_DAY', 'BLOCK_INTERVAL', 'ADD_INTERVAL']), startMinute: minute.optional(), endMinute: minute.optional(), consultationMinutes: z.number().int().min(5).max(120).multipleOf(5).optional() }).strict().superRefine((e, ctx) => {
  const valid = e.type === 'BLOCK_DAY' ? e.startMinute === undefined && e.endMinute === undefined && e.consultationMinutes === undefined
    : e.startMinute !== undefined && e.endMinute !== undefined && e.startMinute < e.endMinute && (e.type === 'ADD_INTERVAL' || e.consultationMinutes === undefined);
  if (!valid) ctx.addIssue({ code: 'custom', message: 'Vérifiez les horaires et le type d’exception.' });
});
function editableDay(date, timezone) {
  const day = dayInZone(date, timezone);
  const today = DateTime.now().setZone(timezone).startOf('day');
  if (day < today || day >= today.plus({ weeks: 8 })) throw new HttpError(400, 'EXCEPTION_OUT_OF_RANGE', 'Choisissez une date dans les huit prochaines semaines.');
  return day;
}
export async function addException(doctorId, body) {
  const input = exceptionInput.parse(body);
  return prisma.$transaction(async tx => {
    const doctor = await lockedDoctor(tx, doctorId);
    const day = editableDay(input.date, doctor.timezone);
    if (input.type === 'ADD_INTERVAL' && input.endMinute - input.startMinute < (input.consultationMinutes ?? doctor.consultationMinutes)) throw new HttpError(400, 'INTERVAL_TOO_SHORT', 'Une plage doit permettre au moins une consultation.');
    const exception = await tx.availabilityException.create({ data: { ...input, date: new Date(`${input.date}T00:00:00Z`), doctorId } });
    await reconcileSlots(tx, doctor, day, day.plus({ days: 1 }));
    return exception;
  }, { timeout: 30000 });
}
export async function removeException(doctorId, id) {
  z.uuid().parse(id);
  await prisma.$transaction(async tx => {
    const doctor = await lockedDoctor(tx, doctorId);
    const exception = await tx.availabilityException.findFirst({ where: { id, doctorId } });
    if (!exception) throw new HttpError(404, 'EXCEPTION_NOT_FOUND', 'Cette exception n’est pas accessible.');
    const day = editableDay(exception.date.toISOString().slice(0, 10), doctor.timezone);
    await tx.availabilityException.delete({ where: { id } });
    await reconcileSlots(tx, doctor, day, day.plus({ days: 1 }));
  }, { timeout: 30000 });
}
