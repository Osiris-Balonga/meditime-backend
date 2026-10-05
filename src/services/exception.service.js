import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/errors.js";
import { addDays, localDateString } from "../lib/timezone.js";
import {
  buildSlots,
  exceptionRange,
  minutesToTime,
  overlaps,
} from "../lib/slotmath.js";
import { TX_OPTIONS } from "./appointment.service.js";
import { getApprovedDoctor } from "./decision.service.js";

const present = (e) => ({
  id: e.id,
  date: e.date.toISOString().slice(0, 10),
  type: e.type.toLowerCase(),
  startTime: minutesToTime(e.startMinute),
  endTime: minutesToTime(e.endMinute),
  consultationMinutes: e.consultationMinutes,
  createdAt: e.createdAt,
});

const asDbDate = (dateString) => new Date(`${dateString}T00:00:00Z`);

// Verrouille (dans un ordre stable, pour éviter les verrous croisés) tous les créneaux de la plage.
async function lockRange(tx, doctorId, { start, end }) {
  await tx.$queryRaw`SELECT id FROM "Slot" WHERE "doctorId" = ${doctorId}::uuid
    AND "startsAt" < ${end}::timestamptz AND "endsAt" > ${start}::timestamptz ORDER BY id FOR UPDATE`;
}

// #8 — liste des exceptions du médecin connecté (par défaut : à partir d'aujourd'hui).
export async function listExceptions(userId, { from, to }) {
  const doctor = await getApprovedDoctor(userId);
  const rows = await prisma.availabilityException.findMany({
    where: {
      doctorId: doctor.id,
      date: {
        gte: asDbDate(from ?? localDateString(doctor.timezone)),
        ...(to && { lte: asDbDate(to) }),
      },
    },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    take: 500,
  });
  return { items: rows.map(present) };
}

// Bloque les créneaux de la plage. Refuse si un rendez-vous y est déjà confirmé.
async function blockRange(tx, doctorId, range) {
  await lockRange(tx, doctorId, range);
  const slots = await tx.slot.findMany({
    where: {
      doctorId,
      startsAt: { lt: range.end },
      endsAt: { gt: range.start },
    },
    select: {
      id: true,
      requests: {
        where: { status: { in: ["PENDING", "CONFIRMED"] } },
        select: { id: true, status: true },
      },
    },
  });
  const confirmed = slots.filter((s) =>
    s.requests.some((r) => r.status === "CONFIRMED"),
  ).length;
  if (confirmed > 0) {
    throw new HttpError(
      409,
      "CONFIRMED_APPOINTMENTS_IN_RANGE",
      `${confirmed} rendez-vous confirmé(s) dans cette plage : annulez-les ou déplacez-les d’abord.`,
    );
  }
  const pendingIds = slots.flatMap((s) => s.requests.map((r) => r.id));
  const now = new Date();
  if (pendingIds.length) {
    await tx.appointmentRequest.updateMany({
      where: { id: { in: pendingIds }, status: "PENDING" },
      data: {
        status: "DECLINED",
        decidedAt: now,
        decisionCode: "SLOT_BLOCKED",
      },
    });
  }
  const { count } = await tx.slot.updateMany({
    where: { id: { in: slots.map((s) => s.id) }, status: "AVAILABLE" },
    data: { status: "BLOCKED" },
  });
  return { blockedSlots: count, declinedRequests: pendingIds.length };
}

// #8 — créer une exception et l'appliquer aux créneaux, dans une transaction.
export async function createException(userId, input) {
  const doctor = await getApprovedDoctor(userId);
  const today = localDateString(doctor.timezone);
  if (input.date < today)
    throw new HttpError(
      400,
      "PAST_DATE",
      "Impossible de créer une exception dans le passé.",
    );
  if (input.date > addDays(today, 366))
    throw new HttpError(
      400,
      "DATE_TOO_FAR",
      "Date trop éloignée (1 an maximum).",
    );

  const duration = input.consultationMinutes ?? doctor.consultationMinutes;
  if (
    input.type === "ADD_INTERVAL" &&
    input.endMinute - input.startMinute < duration
  ) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "La plage est plus courte qu’une consultation.",
    );
  }
  const range = exceptionRange(
    input.date,
    input.startMinute,
    input.endMinute,
    doctor.timezone,
  );

  const result = await prisma.$transaction(async (tx) => {
    const same = await tx.availabilityException.findFirst({
      where: {
        doctorId: doctor.id,
        date: asDbDate(input.date),
        type: input.type,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
      },
      select: { id: true },
    });
    if (same)
      throw new HttpError(
        409,
        "EXCEPTION_ALREADY_EXISTS",
        "Cette exception existe déjà.",
      );

    const created = await tx.availabilityException.create({
      data: {
        doctorId: doctor.id,
        date: asDbDate(input.date),
        type: input.type,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        consultationMinutes: input.consultationMinutes,
      },
    });

    if (input.type === "ADD_INTERVAL") {
      const slots = buildSlots(
        input.date,
        input.startMinute,
        input.endMinute,
        duration,
        doctor.timezone,
      );
      await lockRange(tx, doctor.id, range);
      const { count } = await tx.slot.createMany({
        data: slots.map((s) => ({
          doctorId: doctor.id,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          source: "exception",
        })),
        skipDuplicates: true, // les créneaux déjà existants sont conservés tels quels
      });
      return { created, effects: { createdSlots: count } };
    }
    return { created, effects: await blockRange(tx, doctor.id, range) };
  }, TX_OPTIONS);

  return { ...present(result.created), effects: result.effects };
}

// #8 — supprimer une exception et annuler ses effets sur les créneaux.
export async function deleteException(userId, id) {
  const doctor = await getApprovedDoctor(userId);
  return prisma.$transaction(async (tx) => {
    const exception = await tx.availabilityException.findFirst({
      where: { id, doctorId: doctor.id },
    });
    if (!exception)
      throw new HttpError(
        404,
        "EXCEPTION_NOT_FOUND",
        "Cette exception est introuvable.",
      );
    const date = exception.date.toISOString().slice(0, 10);
    const range = exceptionRange(
      date,
      exception.startMinute,
      exception.endMinute,
      doctor.timezone,
    );
    const now = new Date();
    let effects = { reopenedSlots: 0, removedSlots: 0 };
    await lockRange(tx, doctor.id, range);

    if (exception.type === "ADD_INTERVAL") {
      const slots = await tx.slot.findMany({
        where: {
          doctorId: doctor.id,
          source: "exception",
          startsAt: { gte: range.start, gt: now },
          endsAt: { lte: range.end },
        },
        select: { id: true, requests: { select: { status: true } } },
      });
      if (
        slots.some((s) =>
          s.requests.some((r) => ["PENDING", "CONFIRMED"].includes(r.status)),
        )
      ) {
        throw new HttpError(
          409,
          "ACTIVE_REQUESTS_ON_RANGE",
          "Des demandes actives existent sur ces créneaux : traitez-les d’abord.",
        );
      }
      const free = slots
        .filter((s) => s.requests.length === 0)
        .map((s) => s.id);
      const withHistory = slots
        .filter((s) => s.requests.length > 0)
        .map((s) => s.id);
      if (free.length)
        await tx.slot.deleteMany({ where: { id: { in: free } } });
      if (withHistory.length)
        await tx.slot.updateMany({
          where: { id: { in: withHistory } },
          data: { status: "BLOCKED" },
        });
      effects = { reopenedSlots: 0, removedSlots: free.length };
    } else {
      // Rouvre les créneaux bloqués, sauf ceux encore couverts par une autre exception de blocage du même jour.
      const others = await tx.availabilityException.findMany({
        where: {
          doctorId: doctor.id,
          date: exception.date,
          id: { not: id },
          type: { in: ["BLOCK_DAY", "BLOCK_INTERVAL"] },
        },
      });
      const otherRanges = others.map((o) =>
        exceptionRange(date, o.startMinute, o.endMinute, doctor.timezone),
      );
      const blocked = await tx.slot.findMany({
        where: {
          doctorId: doctor.id,
          status: "BLOCKED",
          startsAt: { lt: range.end, gt: now },
          endsAt: { gt: range.start },
        },
        select: { id: true, startsAt: true, endsAt: true },
      });
      const toOpen = blocked
        .filter(
          (s) =>
            !otherRanges.some((r) =>
              overlaps(s.startsAt, s.endsAt, r.start, r.end),
            ),
        )
        .map((s) => s.id);
      if (toOpen.length)
        await tx.slot.updateMany({
          where: { id: { in: toOpen } },
          data: { status: "AVAILABLE" },
        });
      effects = { reopenedSlots: toOpen.length, removedSlots: 0 };
    }
    await tx.availabilityException.delete({ where: { id } });
    return { id, deleted: true, effects };
  }, TX_OPTIONS);
}
