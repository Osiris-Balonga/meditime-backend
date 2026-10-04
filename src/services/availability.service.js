import { DateTime } from 'luxon';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { lockDoctor } from '../lib/doctor-lock.js';
import { dateRange, localMinute } from '../lib/planning-time.js';
import { HttpError } from '../middlewares/errors.js';
import { doctorDetail } from './doctor.service.js';

const minute = z.number().int().min(0).max(1440);
const range = z.object({ weekday: z.number().int().min(1).max(7), startMinute: minute, endMinute: minute }).strict().refine(r => r.startMinute < r.endMinute);
const weeklyInput = z.object({ ranges: z.array(range).max(28) }).strict();
export const slotSelect = { id: true, startsAt: true, endsAt: true, status: true, source: true };
export async function lockedDoctor(tx, id) {
  await lockDoctor(tx, id);
  const doctor = await tx.doctorProfile.findUnique({ where: { id } });
  if (!doctor?.isApproved) throw new HttpError(403, 'DOCTOR_ACCESS_REQUIRED', 'Ce compte n’a pas d’accès médecin.');
  return doctor;
}
export function assertNoOverlap(ranges) {
  const sorted = [...ranges].sort((a, b) => a.startMinute - b.startMinute);
  if (sorted.some((r, index) => index && r.startMinute < sorted[index - 1].endMinute)) throw new HttpError(409, 'OVERLAPPING_INTERVALS', 'Les plages horaires se chevauchent.');
}

// All callers hold the doctor lock, also used by appointment mutations.
export async function reconcileSlots(tx, doctor, start, end) {
  const now = new Date();
  const from = start.toUTC().toJSDate();
  const to = end.toUTC().toJSDate();
  const [weekly, exceptions, existing] = await Promise.all([
    tx.weeklyAvailability.findMany({ where: { doctorId: doctor.id } }),
    tx.availabilityException.findMany({ where: { doctorId: doctor.id, date: { gte: new Date(`${start.toISODate()}T00:00:00Z`), lt: new Date(`${end.toISODate()}T00:00:00Z`) } } }),
    tx.slot.findMany({ where: { doctorId: doctor.id, startsAt: { gte: from, lt: to }, endsAt: { gt: now } }, include: { requests: { select: { id: true, status: true } } } }),
  ]);
  const desired = new Map();
  for (let day = start; day < end; day = day.plus({ days: 1 })) {
    const daily = exceptions.filter(e => e.date.toISOString().slice(0, 10) === day.toISODate());
    const ranges = weekly.filter(r => r.weekday === day.weekday).map(r => ({ ...r, duration: doctor.consultationMinutes, source: 'weekly' }));
    ranges.push(...daily.filter(e => e.type === 'ADD_INTERVAL').map(e => ({ ...e, duration: e.consultationMinutes ?? doctor.consultationMinutes, source: 'exception' })));
    assertNoOverlap(ranges);
    const blockedDay = daily.some(e => e.type === 'BLOCK_DAY');
    for (const r of ranges) {
      for (let m = r.startMinute; m + r.duration <= r.endMinute; m += r.duration) {
        const startsAt = localMinute(day, m), endsAt = localMinute(day, m + r.duration);
        if (startsAt <= now) continue;
        const blocked = blockedDay || daily.some(e => e.type === 'BLOCK_INTERVAL' && m < e.endMinute && m + r.duration > e.startMinute);
        desired.set(startsAt.getTime(), { doctorId: doctor.id, startsAt, endsAt, source: r.source, status: blocked ? 'BLOCKED' : 'AVAILABLE' });
      }
    }
  }
  const additions = new Map(desired);
  for (const slot of existing) {
    const target = desired.get(slot.startsAt.getTime());
    const same = target && target.endsAt.getTime() === slot.endsAt.getTime();
    const confirmed = slot.requests.some(r => r.status === 'CONFIRMED');
    if (slot.startsAt <= now) continue;
    if ((!same && slot.requests.length) || (confirmed && target?.status === 'BLOCKED')) {
      throw new HttpError(409, 'PLANNING_HAS_APPOINTMENTS', 'Cette modification affecte un rendez-vous ou une demande existante.');
    }
    if (!same) {
      await tx.slot.delete({ where: { id: slot.id } });
    } else {
      additions.delete(slot.startsAt.getTime());
      if (target.status === 'BLOCKED') await tx.appointmentRequest.updateMany({ where: { slotId: slot.id, status: 'PENDING' }, data: { status: 'DECLINED', decisionCode: 'SLOT_BLOCKED', decidedAt: now } });
      await tx.slot.update({ where: { id: slot.id }, data: { status: target.status, source: target.source } });
    }
  }
  if (additions.size) await tx.slot.createMany({ data: [...additions.values()] });
}

export async function weeklyAvailability(id) {
  const doctor = await prisma.doctorProfile.findUniqueOrThrow({ where: { id }, select: { consultationMinutes: true, timezone: true } });
  return { ...doctor, ranges: await prisma.weeklyAvailability.findMany({ where: { doctorId: id }, orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }], select: { weekday: true, startMinute: true, endMinute: true } }) };
}
export async function saveWeekly(id, body) {
  const { ranges } = weeklyInput.parse(body);
  for (let weekday = 1; weekday <= 7; weekday++) assertNoOverlap(ranges.filter(r => r.weekday === weekday));
  await prisma.$transaction(async tx => {
    const doctor = await lockedDoctor(tx, id);
    if (ranges.some(r => r.endMinute - r.startMinute < doctor.consultationMinutes)) throw new HttpError(400, 'INTERVAL_TOO_SHORT', 'Une plage doit permettre au moins une consultation.');
    await tx.weeklyAvailability.deleteMany({ where: { doctorId: id } });
    if (ranges.length) await tx.weeklyAvailability.createMany({ data: ranges.map(r => ({ ...r, doctorId: id })) });
    const start = DateTime.now().setZone(doctor.timezone).startOf('day');
    await reconcileSlots(tx, doctor, start, start.plus({ weeks: 8 }));
  }, { timeout: 60000 });
  return weeklyAvailability(id);
}
export async function readSlots(id, query, privatePlanning = false) {
  const doctor = privatePlanning ? await prisma.doctorProfile.findUniqueOrThrow({ where: { id } }) : await doctorDetail(id);
  const dates = dateRange(query, doctor.timezone);
  const slots = await prisma.slot.findMany({ where: { doctorId: id, startsAt: { gte: dates.from, lt: dates.to, ...(!privatePlanning && { gt: new Date() }) } }, orderBy: { startsAt: 'asc' }, select: {
    ...slotSelect, requests: { where: { status: 'CONFIRMED' }, select: privatePlanning ? { id: true, reason: true, patient: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } : { id: true } },
  } });
  return { timezone: doctor.timezone, slots: slots.map(({ requests, ...slot }) => ({ ...slot, status: requests.length ? 'OCCUPIED' : slot.status, ...(privatePlanning && { appointment: requests[0] ?? null }) })) };
}
