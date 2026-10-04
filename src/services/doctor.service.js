import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middlewares/errors.js';

export const publicDoctorSelect = {
  id: true, practiceName: true, address: true, city: true, postalCode: true,
  timezone: true, consultationMinutes: true,
  specialty: { select: { id: true, slug: true, name: true } },
  user: { select: { firstName: true, lastName: true, avatarUrl: true } },
};
export const uuid = z.uuid();
const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const input = z.object({
  q: z.string().trim().max(100).default(''), city: z.string().trim().max(100).default(''),
  specialtyId: uuid.optional(), page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  availableBefore: z.iso.datetime({ offset: true }).optional(),
}).strict();
const escaped = value => `%${fold(value).replace(/[\\%_]/g, '\\$&')}%`;

export async function listSpecialties() {
  return prisma.specialty.findMany({ orderBy: { name: 'asc' } });
}
export async function doctorDetail(id) {
  const doctor = await prisma.doctorProfile.findFirst({ where: { id: uuid.parse(id), published: true, isApproved: true }, select: publicDoctorSelect });
  if (!doctor) throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'Ce médecin n’est pas disponible.');
  return doctor;
}
export async function searchDoctors(query) {
  const { q, city, specialtyId, page, limit, availableBefore } = input.parse(query);
  const where = Prisma.sql`d."published" = true AND d."isApproved" = true
    AND lower(regexp_replace(normalize(concat_ws(' ', u."firstName", u."lastName", s."name"), NFD), '[̀-ͯ]', '', 'g')) LIKE ${escaped(q)}
    AND lower(regexp_replace(normalize(d."city", NFD), '[̀-ͯ]', '', 'g')) LIKE ${escaped(city)}
    ${specialtyId ? Prisma.sql`AND d."specialtyId" = ${specialtyId}::uuid` : Prisma.empty}
    ${availableBefore ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Slot" sl WHERE sl."doctorId" = d.id AND sl.status = 'available' AND sl."startsAt" > ${new Date()} AND sl."startsAt" <= ${new Date(availableBefore)} AND NOT EXISTS (SELECT 1 FROM "AppointmentRequest" ar WHERE ar."slotId" = sl.id AND ar.status = 'confirmed'))` : Prisma.empty}`;
  const from = Prisma.sql`FROM "DoctorProfile" d JOIN "User" u ON u.id = d."userId" JOIN "Specialty" s ON s.id = d."specialtyId" WHERE ${where}`;
  const [ids, counts] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`SELECT d.id ${from} ORDER BY u."lastName", u."firstName", d.id LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
    prisma.$queryRaw(Prisma.sql`SELECT count(*)::int AS total ${from}`),
  ]);
  const doctors = await prisma.doctorProfile.findMany({ where: { id: { in: ids.map(row => row.id) } }, select: {
    ...publicDoctorSelect, slots: { where: { status: 'AVAILABLE', startsAt: { gt: new Date() }, requests: { none: { status: 'CONFIRMED' } } }, orderBy: { startsAt: 'asc' }, take: 1, select: { id: true, startsAt: true, endsAt: true } },
  } });
  const byId = new Map(doctors.map(({ slots, ...doctor }) => [doctor.id, { ...doctor, nextAvailableSlot: slots[0] ?? null }]));
  return { doctors: ids.map(row => byId.get(row.id)), pagination: { page, limit, total: counts[0].total } };
}
