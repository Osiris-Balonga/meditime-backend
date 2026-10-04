import { prisma } from "../lib/prisma.js";
import { presentRequest } from "../lib/appointmentPresenter.js";
import { todayBounds } from "../lib/timezone.js";
import { requestInclude } from "./appointment.service.js";
import { getApprovedDoctor } from "./decision.service.js";

function countsByStatus(grouped) {
  const counts = { pending: 0, confirmed: 0, declined: 0, cancelled: 0 };
  for (const row of grouped) counts[row.status.toLowerCase()] = row._count._all;
  return counts;
}

// #11 — tableau de bord patient.
export async function patientDashboard(patientId) {
  const now = new Date();
  const [grouped, upcoming, pending, pastConfirmed] = await Promise.all([
    prisma.appointmentRequest.groupBy({
      by: ["status"],
      where: { patientId },
      _count: { _all: true },
    }),
    prisma.appointmentRequest.findMany({
      where: { patientId, status: "CONFIRMED", slot: { endsAt: { gt: now } } },
      include: requestInclude,
      orderBy: { slot: { startsAt: "asc" } },
      take: 5,
    }),
    prisma.appointmentRequest.findMany({
      where: { patientId, status: "PENDING", slot: { endsAt: { gt: now } } },
      include: requestInclude,
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.appointmentRequest.count({
      where: { patientId, status: "CONFIRMED", slot: { endsAt: { lte: now } } },
    }),
  ]);
  return {
    counts: countsByStatus(grouped),
    pastAppointments: pastConfirmed,
    upcomingAppointments: upcoming.map((r) => presentRequest(r, now)),
    pendingRequests: pending.map((r) => presentRequest(r, now)),
  };
}

// #11 — tableau de bord médecin.
export async function doctorDashboard(userId) {
  const doctor = await getApprovedDoctor(userId);
  const now = new Date();
  const { start, end } = todayBounds(doctor.timezone, now);
  const forDoctor = { slot: { doctorId: doctor.id } };
  const include = {
    slot: true,
    patient: {
      select: { id: true, firstName: true, lastName: true, phone: true },
    },
  };

  const [grouped, today, toHandle, upcoming, freeSlots] = await Promise.all([
    prisma.appointmentRequest.groupBy({
      by: ["status"],
      where: forDoctor,
      _count: { _all: true },
    }),
    prisma.appointmentRequest.findMany({
      where: {
        status: "CONFIRMED",
        slot: { doctorId: doctor.id, startsAt: { gte: start, lt: end } },
      },
      include,
      orderBy: { slot: { startsAt: "asc" } },
    }),
    prisma.appointmentRequest.findMany({
      where: {
        status: "PENDING",
        slot: { doctorId: doctor.id, endsAt: { gt: now } },
      },
      include,
      orderBy: { createdAt: "asc" },
      take: 10, // les plus anciennes d'abord
    }),
    prisma.appointmentRequest.findMany({
      where: {
        status: "CONFIRMED",
        slot: { doctorId: doctor.id, startsAt: { gte: now } },
      },
      include,
      orderBy: { slot: { startsAt: "asc" } },
      take: 10,
    }),
    prisma.slot.count({
      where: {
        doctorId: doctor.id,
        status: "AVAILABLE",
        startsAt: { gt: now },
        requests: { none: { status: "CONFIRMED" } },
      },
    }),
  ]);
  return {
    counts: countsByStatus(grouped),
    availableSlots: freeSlots,
    todayAppointments: today.map((r) => presentRequest(r, now)),
    pendingRequests: toHandle.map((r) => presentRequest(r, now)),
    upcomingAppointments: upcoming.map((r) => presentRequest(r, now)),
  };
}
