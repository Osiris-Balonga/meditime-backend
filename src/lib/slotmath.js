import { zonedTimeToUtc } from "./timezone.js";

// Plage UTC [start, end) couverte par une exception (BLOCK_DAY = journée entière).
export function exceptionRange(dateString, startMinute, endMinute, timeZone) {
  const from = startMinute ?? 0;
  const to = endMinute ?? 1440;
  return {
    start: zonedTimeToUtc(dateString, from, timeZone),
    end: zonedTimeToUtc(dateString, to, timeZone),
  };
}

// Créneaux à créer pour un ADD_INTERVAL : uniquement les créneaux entiers et futurs.
export function buildSlots(
  dateString,
  startMinute,
  endMinute,
  durationMinutes,
  timeZone,
  now = new Date(),
) {
  const slots = [];
  for (
    let t = startMinute;
    t + durationMinutes <= endMinute;
    t += durationMinutes
  ) {
    const startsAt = zonedTimeToUtc(dateString, t, timeZone);
    if (startsAt <= now) continue;
    slots.push({
      startsAt,
      endsAt: zonedTimeToUtc(dateString, t + durationMinutes, timeZone),
    });
  }
  return slots;
}

export const overlaps = (aStart, aEnd, bStart, bEnd) =>
  aStart < bEnd && aEnd > bStart;

export function minutesToTime(minutes) {
  if (minutes === null || minutes === undefined) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
