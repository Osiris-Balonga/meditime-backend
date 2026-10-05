import { DateTime } from 'luxon';
import { z } from 'zod';
import { HttpError } from '../middlewares/errors.js';

export const dateInput = z.iso.date();
export function dayInZone(date, zone) {
  const day = DateTime.fromISO(dateInput.parse(date), { zone });
  if (!day.isValid) throw new HttpError(400, 'INVALID_DATE', 'Cette date est invalide.');
  return day;
}
export function localMinute(day, minute) {
  const date = minute === 1440 ? day.plus({ days: 1 }).startOf('day') : day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 });
  if (!date.isValid || (minute !== 1440 && date.hour * 60 + date.minute !== minute) || date.getPossibleOffsets().length > 1) {
    throw new HttpError(409, 'AMBIGUOUS_LOCAL_TIME', 'Cet horaire est ambigu ou inexistant lors du changement d’heure.');
  }
  return date.toUTC().toJSDate();
}
export function dateRange(query, zone, maxDays = 56) {
  const values = z.object({ from: dateInput.optional(), to: dateInput.optional() }).strict().parse(query);
  const today = DateTime.now().setZone(zone).startOf('day');
  const start = values.from ? dayInZone(values.from, zone) : today;
  const end = values.to ? dayInZone(values.to, zone).plus({ days: 1 }) : start.plus({ days: 7 });
  const days = end.diff(start, 'days').days;
  if (days <= 0 || days > maxDays) throw new HttpError(400, 'INVALID_DATE_RANGE', `Choisissez une période de 1 à ${maxDays} jours.`);
  return { start, end, from: start.toUTC().toJSDate(), to: end.toUTC().toJSDate() };
}
