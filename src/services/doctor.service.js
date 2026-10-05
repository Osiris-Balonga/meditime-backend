import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/errors.js";
import { dayBoundsFor } from "../lib/timezone.js";

// Seuls les médecins approuvés ET publiés existent pour le public.
const visible = { isApproved: true, published: true };

const doctorSelect = {
  id: true,
  practiceName: true,
  address: true,
  city: true,
  postalCode: true,
  timezone: true,
  consultationMinutes: true,
  user: { select: { firstName: true, lastName: true } }, // jamais d'e-mail ni de téléphone
  specialty: { select: { slug: true, name: true } },
};

// Un créneau est réservable s'il est libre, futur, et sans rendez-vous confirmé.
const bookable = (now) => ({
  status: "AVAILABLE",
  startsAt: { gt: now },
  requests: { none: { status: "CONFIRMED" } },
});

const present = (d, nextAvailableAt = null) => ({
  id: d.id,
  firstName: d.user.firstName,
  lastName: d.user.lastName,
  specialty: d.specialty,
  practiceName: d.practiceName,
  address: d.address,
  city: d.city,
  postalCode: d.postalCode,
  timezone: d.timezone,
  consultationMinutes: d.consultationMinutes,
  nextAvailableAt,
});

export async function listSpecialties() {
  const rows = await prisma.specialty.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
  return { items: rows };
}

// #6 — recherche : texte libre (nom, cabinet), spécialité, ville.
export async function searchDoctors({ q, specialty, city, page, limit }) {
  const insensitive = (v) => ({ contains: v, mode: "insensitive" });
  const where = {
    ...visible,
    ...(specialty && { specialty: { slug: specialty } }),
    ...(city && { city: { equals: city, mode: "insensitive" } }),
    ...(q && {
      OR: [
        { practiceName: insensitive(q) },
        { user: { firstName: insensitive(q) } },
        { user: { lastName: insensitive(q) } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.doctorProfile.findMany({
      where,
      select: doctorSelect,
      take: limit,
      skip: (page - 1) * limit,
      orderBy: [{ user: { lastName: "asc" } }, { id: "asc" }],
    }),
    prisma.doctorProfile.count({ where }),
  ]);

  // Prochain créneau libre de chaque médecin de la page, en une seule requête.
  const next = rows.length
    ? await prisma.slot.findMany({
        where: {
          doctorId: { in: rows.map((d) => d.id) },
          ...bookable(new Date()),
        },
        select: { doctorId: true, startsAt: true },
        orderBy: { startsAt: "asc" },
        distinct: ["doctorId"],
      })
    : [];
  const nextByDoctor = new Map(next.map((s) => [s.doctorId, s.startsAt]));
  return {
    items: rows.map((d) => present(d, nextByDoctor.get(d.id) ?? null)),
    page,
    limit,
    total,
  };
}

async function findVisibleDoctor(id) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: { id, ...visible },
    select: doctorSelect,
  });
  if (!doctor)
    throw new HttpError(404, "DOCTOR_NOT_FOUND", "Ce médecin est introuvable.");
  return doctor;
}

// #6 — profil d'un médecin.
export async function getDoctor(id) {
  const doctor = await findVisibleDoctor(id);
  const next = await prisma.slot.findFirst({
    where: { doctorId: id, ...bookable(new Date()) },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true },
  });
  return present(doctor, next?.startsAt ?? null);
}

// #6 — créneaux libres d'un médecin sur une période (dates dans SON fuseau).
export async function listDoctorSlots(id, parseRange) {
  const doctor = await findVisibleDoctor(id);
  const { from, to } = parseRange(doctor.timezone);
  const now = new Date();
  const start = dayBoundsFor(from, doctor.timezone).start;
  const end = dayBoundsFor(to, doctor.timezone).end;
  const slots = await prisma.slot.findMany({
    where: {
      doctorId: id,
      ...bookable(now),
      startsAt: { gt: now, gte: start, lt: end },
    },
    select: { id: true, startsAt: true, endsAt: true },
    orderBy: { startsAt: "asc" },
    take: 1000,
  });
  return {
    doctorId: id,
    timezone: doctor.timezone,
    consultationMinutes: doctor.consultationMinutes,
    from,
    to,
    slots,
  };
}
