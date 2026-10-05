
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { lockDoctor } from '../lib/doctor-lock.js';
import { HttpError } from '../middlewares/errors.js';

const SLOT_HORIZON_WEEKS = 8;

const availabilityItem = z.object({
  weekday: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
}).refine(
  (value) => value.startMinute < value.endMinute,
  {
    message: "L'heure de début doit être avant l'heure de fin.",
  }
);

const availabilityInput = z.object({
  availability: z.array(availabilityItem),
}).strict();

function validateOverlaps(availability) {
  const byDay = new Map();

  for (const item of availability) {
    if (!byDay.has(item.weekday)) {
      byDay.set(item.weekday, []);
    }

    byDay.get(item.weekday).push(item);
  }

  for (const ranges of byDay.values()) {
    ranges.sort((a, b) => a.startMinute - b.startMinute);

    for (let i = 1; i < ranges.length; i += 1) {
      const previous = ranges[i - 1];
      const current = ranges[i];

      if (current.startMinute < previous.endMinute) {
        throw new HttpError(
          422,
          'AVAILABILITY_OVERLAP',
          'Deux horaires se chevauchent.'
        );
      }
    }
  }
}

function getTimezoneOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }

  const asUTC = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );

  return Math.round((asUTC - date.getTime()) / 60000);
}

function localDateTimeToUTC(
  year,
  month,
  day,
  minuteOfDay,
  timeZone
) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;

  const utcGuess = new Date(
    Date.UTC(year, month - 1, day, hour, minute)
  );

  const offset = getTimezoneOffsetMinutes(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offset * 60 * 1000);
}

function getLocalDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  const weekdayMap = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: weekdayMap[values.weekday],
  };
}

function addDays(year, month, day, days) {
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function buildDesiredSlots({
  availability,
  timezone,
  consultationMinutes,
  from,
}) {
  const localStart = getLocalDateParts(from, timezone);
  const desiredSlots = [];

  for (let dayOffset = 0; dayOffset < 7 * SLOT_HORIZON_WEEKS; dayOffset += 1) {
    const date = addDays(
      localStart.year,
      localStart.month,
      localStart.day,
      dayOffset
    );

    const dateAtNoonUTC = new Date(
      Date.UTC(date.year, date.month - 1, date.day, 12)
    );

    const localParts = getLocalDateParts(dateAtNoonUTC, timezone);

    const dayAvailability = availability.filter(
      (item) => item.weekday === localParts.weekday
    );

    for (const range of dayAvailability) {
      for (
        let minute = range.startMinute;
        minute + consultationMinutes <= range.endMinute;
        minute += consultationMinutes
      ) {
        const startsAt = localDateTimeToUTC(
          date.year,
          date.month,
          date.day,
          minute,
          timezone
        );

        const endsAt = localDateTimeToUTC(
          date.year,
          date.month,
          date.day,
          minute + consultationMinutes,
          timezone
        );

        if (startsAt <= from) {
          continue;
        }

        desiredSlots.push({
          startsAt,
          endsAt,
          status: 'AVAILABLE',
          source: 'weekly',
        });
      }
    }
  }

  return desiredSlots;
}

async function synchronizeSlots(
  tx,
  doctorId,
  availability,
  timezone,
  consultationMinutes
) {
  const now = new Date();

  const desiredSlots = buildDesiredSlots({
    availability,
    timezone,
    consultationMinutes,
    from: now,
  });

  const desiredByStart = new Map(
    desiredSlots.map((slot) => [
      slot.startsAt.getTime(),
      slot,
    ])
  );

  const horizonEnd = new Date(
    now.getTime() + SLOT_HORIZON_WEEKS * 7 * 24 * 60 * 60 * 1000
  );

  const existingSlots = await tx.slot.findMany({
    where: {
      doctorId,
      startsAt: {
        gte: now,
        lt: horizonEnd,
      },
    },
    include: {
      requests: {
        select: {
          id: true,
        },
      },
    },
  });

  for (const slot of existingSlots) {
    const desired = desiredByStart.get(slot.startsAt.getTime());

    if (!desired && slot.requests.length > 0) {
      throw new HttpError(
        409,
        'PLANNING_CHANGE_REQUIRED',
        'Impossible de modifier le planning : un créneau existant possède déjà une demande de rendez-vous.'
      );
    }
  }

  for (const slot of existingSlots) {
    const desired = desiredByStart.get(slot.startsAt.getTime());

    if (!desired && slot.requests.length === 0) {
      await tx.slot.delete({
        where: { id: slot.id },
      });
    }
  }

  const existingStarts = new Set(
    existingSlots.map((slot) => slot.startsAt.getTime())
  );

  const slotsToCreate = desiredSlots.filter(
    (slot) => !existingStarts.has(slot.startsAt.getTime())
  );

  if (slotsToCreate.length > 0) {
    await tx.slot.createMany({
      data: slotsToCreate.map((slot) => ({
        doctorId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: slot.status,
        source: slot.source,
      })),
      skipDuplicates: true,
    });
  }
}

export async function getDoctorAvailability(doctorId) {
  return prisma.weeklyAvailability.findMany({
    where: { doctorId },
    orderBy: [
      { weekday: 'asc' },
      { startMinute: 'asc' },
    ],
    select: {
      id: true,
      weekday: true,
      startMinute: true,
      endMinute: true,
    },
  });
}

export async function updateDoctorAvailability(doctorId, body) {
  const data = availabilityInput.parse(body);

  validateOverlaps(data.availability);

  return prisma.$transaction(async (tx) => {
    await lockDoctor(tx, doctorId);

    const doctor = await tx.doctorProfile.findUnique({
      where: { id: doctorId },
      select: {
        timezone: true,
        consultationMinutes: true,
      },
    });

    if (!doctor) {
      throw new HttpError(
        404,
        'DOCTOR_NOT_FOUND',
        'Profil médecin introuvable.'
      );
    }

    await synchronizeSlots(
      tx,
      doctorId,
      data.availability,
      doctor.timezone,
      doctor.consultationMinutes
    );

    await tx.weeklyAvailability.deleteMany({
      where: { doctorId },
    });

    if (data.availability.length > 0) {
      await tx.weeklyAvailability.createMany({
        data: data.availability.map((item) => ({
          doctorId,
          weekday: item.weekday,
          startMinute: item.startMinute,
          endMinute: item.endMinute,
        })),
      });
    }

    return tx.weeklyAvailability.findMany({
      where: { doctorId },
      orderBy: [
        { weekday: 'asc' },
        { startMinute: 'asc' },
      ],
      select: {
        id: true,
        weekday: true,
        startMinute: true,
        endMinute: true,
      },
    });
  }, { timeout: 15000 });
}