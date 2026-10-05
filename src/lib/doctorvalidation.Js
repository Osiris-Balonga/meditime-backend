import { HttpError } from "../middlewares/errors.js";
import { addDays, localDateString } from "./timezone.js";

const invalid = (message) => new HttpError(400, "VALIDATION_ERROR", message);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const SLUG_RE = /^[a-z0-9-]{1,60}$/;
export const EXCEPTION_TYPES = ["block_day", "block_interval", "add_interval"];

export function parseDate(value, field) {
  if (typeof value !== "string" || !DATE_RE.test(value))
    throw invalid(`${field} doit être une date au format AAAA-MM-JJ.`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw invalid(`${field} n’est pas une date valide.`);
  return value;
}

export function parseTime(value, field) {
  if (typeof value !== "string" || !TIME_RE.test(value))
    throw invalid(
      `${field} doit être une heure au format HH:MM (00:00 à 24:00).`,
    );
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function parsePaging(query) {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw invalid("limit doit être un entier entre 1 et 50.");
  if (!Number.isInteger(page) || page < 1)
    throw invalid("page doit être un entier supérieur ou égal à 1.");
  return { limit, page };
}

const text = (value, field, max) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string")
    throw invalid(`${field} doit être une chaîne de caractères.`);
  const v = value.trim();
  if (v.length > max)
    throw invalid(`${field} ne doit pas dépasser ${max} caractères.`);
  return v || undefined;
};

// #6 — GET /doctors?q=&specialty=&city=&page=&limit=
export function parseSearchQuery(query) {
  const specialty = text(query.specialty, "specialty", 60);
  if (specialty !== undefined && !SLUG_RE.test(specialty))
    throw invalid(
      "specialty doit être un identifiant (lettres minuscules, chiffres, tirets).",
    );
  return {
    ...parsePaging(query),
    q: text(query.q, "q", 100),
    city: text(query.city, "city", 100),
    specialty,
  };
}

// #6 — GET /doctors/:id/slots?from=AAAA-MM-JJ&to=AAAA-MM-JJ (31 jours maximum)
export function parseSlotRange(query, timeZone, now = new Date()) {
  const from =
    query.from === undefined
      ? localDateString(timeZone, now)
      : parseDate(query.from, "from");
  const to =
    query.to === undefined ? addDays(from, 13) : parseDate(query.to, "to");
  if (to < from) throw invalid("to doit être postérieure ou égale à from.");
  if (addDays(from, 30) < to)
    throw invalid("La période ne peut pas dépasser 31 jours.");
  return { from, to };
}

// #8 — corps de POST /doctor/exceptions
export function parseExceptionBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw invalid("Le corps de la requête doit être un objet JSON.");
  const date = parseDate(body.date, "date");
  if (!EXCEPTION_TYPES.includes(body.type))
    throw invalid(`type doit valoir : ${EXCEPTION_TYPES.join(", ")}.`);

  if (body.type === "block_day") {
    if (
      body.startTime !== undefined ||
      body.endTime !== undefined ||
      body.consultationMinutes !== undefined
    ) {
      throw invalid(
        "block_day ne prend ni startTime, ni endTime, ni consultationMinutes.",
      );
    }
    return {
      date,
      type: "BLOCK_DAY",
      startMinute: null,
      endMinute: null,
      consultationMinutes: null,
    };
  }

  const startMinute = parseTime(body.startTime, "startTime");
  const endMinute = parseTime(body.endTime, "endTime");
  if (startMinute >= endMinute)
    throw invalid("startTime doit être avant endTime.");

  let consultationMinutes = null;
  if (body.consultationMinutes !== undefined) {
    if (body.type !== "add_interval")
      throw invalid("consultationMinutes n’est accepté que pour add_interval.");
    const c = body.consultationMinutes;
    if (!Number.isInteger(c) || c < 5 || c > 120 || c % 5 !== 0)
      throw invalid(
        "consultationMinutes doit être un entier entre 5 et 120, multiple de 5.",
      );
    consultationMinutes = c;
  }
  return {
    date,
    type: body.type.toUpperCase(),
    startMinute,
    endMinute,
    consultationMinutes,
  };
}

// #8 — GET /doctor/exceptions?from=&to=
export function parseExceptionListQuery(query) {
  return {
    from: query.from === undefined ? undefined : parseDate(query.from, "from"),
    to: query.to === undefined ? undefined : parseDate(query.to, "to"),
  };
}
