import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { lockDoctor } from '../lib/doctor-lock.js';
import { HttpError } from '../middlewares/errors.js';
import { userSelect } from './session.service.js';

const name = z.string().trim().min(1).max(80);
const profileInput = z.object({
  firstName: name.optional(), lastName: name.optional(),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ()-]{5,24}$/).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Envoyez au moins un champ.');

const doctorInput = z.object({
  specialtyId: z.uuid().optional(),
  practiceName: z.string().trim().min(1).max(150).optional(),
  address: z.string().trim().min(1).max(250).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  timezone: z.string().max(80).refine((value) => {
    try { new Intl.DateTimeFormat('fr', { timeZone: value }); return true; } catch { return false; }
  }, 'Fuseau horaire invalide.').optional(),
  consultationMinutes: z.number().int().min(5).max(120).multipleOf(5).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Envoyez au moins un champ.');

const doctorSelect = {
  id: true, specialtyId: true, practiceName: true, address: true, city: true,
  postalCode: true, timezone: true, consultationMinutes: true, published: true,
  specialty: { select: { id: true, slug: true, name: true } },
};

export async function updateProfile(userId, body) {
  const data = profileInput.parse(body);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
    const complete = (data.firstName ?? current.firstName) && (data.lastName ?? current.lastName);
    return tx.user.update({ where: { id: userId }, data: {
      ...data, ...(complete && !current.profileCompletedAt ? { profileCompletedAt: new Date() } : {}),
    }, select: userSelect });
  }, { timeout: 15000 });
}

export async function getDoctorProfile(doctorId) {
  const profile = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, select: doctorSelect });
  if (!profile) throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'Le profil médecin n’existe pas.');
  return profile;
}

export async function updateDoctorProfile(doctorId, body) {
  const data = doctorInput.parse(body);
  return prisma.$transaction(async (tx) => {
    await lockDoctor(tx, doctorId);
    const current = await tx.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!current?.isApproved) throw new HttpError(403, 'DOCTOR_ACCESS_REQUIRED', 'Ce compte n’a pas d’accès médecin.');
    if (data.specialtyId && !await tx.specialty.findUnique({ where: { id: data.specialtyId } })) {
      throw new HttpError(422, 'INVALID_SPECIALTY', 'Choisissez une spécialité existante.');
    }
    const scheduleChanged = (data.timezone && data.timezone !== current.timezone)
      || (data.consultationMinutes && data.consultationMinutes !== current.consultationMinutes);
    if (scheduleChanged && await tx.slot.count({ where: { doctorId, endsAt: { gt: new Date() } } })) {
      throw new HttpError(409, 'PLANNING_CHANGE_REQUIRED', 'Le planning contient des créneaux à venir. Réorganisez-le avant de changer la durée ou le fuseau.');
    }
    return tx.doctorProfile.update({ where: { id: doctorId }, data, select: doctorSelect });
  }, { timeout: 15000 });
}
