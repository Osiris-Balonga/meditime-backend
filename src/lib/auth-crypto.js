import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../middlewares/errors.js';

export function requireAuthConfig() {
  if (!env.SESSION_SECRET) {
    throw new HttpError(503, 'AUTH_NOT_CONFIGURED', 'Le service de connexion n’est pas encore configuré.');
  }
}

export function hashValue(purpose, value) {
  requireAuthConfig();
  return createHmac('sha256', env.SESSION_SECRET).update(`${purpose}:${value}`).digest('hex');
}

export function sameSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export async function lockEmail(tx, email) {
  // Serializes OTP issuance/consumption and account linking for the same email.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email})::bigint)`;
}
