import { HttpError } from "../middlewares/errors.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["pending", "confirmed", "declined", "cancelled"];

const invalid = (message) => new HttpError(400, "VALIDATION_ERROR", message);

export function requireUuid(value, field) {
  if (typeof value !== "string" || !UUID_RE.test(value))
    throw invalid(`${field} doit être un identifiant valide.`);
  return value;
}

export function parseReason(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string")
    throw invalid("reason doit être une chaîne de caractères.");
  const reason = value.trim();
  if (reason.length > 1000)
    throw invalid("reason ne doit pas dépasser 1000 caractères.");
  return reason || null;
}

// Liste paginée : ?status=pending&page=1&limit=20 (statuts en minuscules côté API).
export function parseListQuery(query) {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw invalid("limit doit être un entier entre 1 et 50.");
  if (!Number.isInteger(page) || page < 1)
    throw invalid("page doit être un entier supérieur ou égal à 1.");
  let status;
  if (query.status !== undefined) {
    if (typeof query.status !== "string" || !STATUSES.includes(query.status)) {
      throw invalid(`status doit valoir : ${STATUSES.join(", ")}.`);
    }
    status = query.status.toUpperCase(); // enum Prisma en majuscules
  }
  return { limit, page, status };
}
