import { prisma } from '../lib/prisma.js';
import { hashValue, requireAuthConfig, sameSecret } from '../lib/auth-crypto.js';
import { SESSION_COOKIE, userSelect } from '../services/session.service.js';
import { HttpError } from './errors.js';

export async function optionalSession(req, res, next) {
  delete req.auth;
  delete req.user;
  const token = req.cookies[SESSION_COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return next();
  requireAuthConfig();
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashValue('session', token) },
    include: { user: { select: userSelect } },
  });
  if (session && !session.revokedAt && session.expiresAt > new Date()) {
    req.user = session.user;
    req.auth = {
      userId: session.userId,
      sessionId: session.id,
      doctorId: session.user.doctorProfile?.isApproved ? session.user.doctorProfile.id : null,
      csrfToken: hashValue('csrf', token),
    };
  }
  next();
}

export async function requireSession(req, res, next) {
  requireAuthConfig();
  await optionalSession(req, res, () => {});
  if (!req.auth) throw new HttpError(401, 'UNAUTHENTICATED', 'Connectez-vous pour continuer.');
  res.set('Cache-Control', 'no-store');
  next();
}

export function requireDoctor(req, res, next) {
  if (!req.auth) throw new HttpError(401, 'UNAUTHENTICATED', 'Connectez-vous pour continuer.');
  if (!req.auth.doctorId) throw new HttpError(403, 'DOCTOR_ACCESS_REQUIRED', 'Ce compte n’a pas d’accès médecin.');
  next();
}

export function requireCsrf(req, res, next) {
  if (!req.auth || !sameSecret(req.get('X-CSRF-Token'), req.auth.csrfToken)) {
    throw new HttpError(403, 'INVALID_CSRF', 'Rechargez votre session avant de réessayer.');
  }
  next();
}

export function csrfIfAuthenticated(req, res, next) {
  if (req.auth) return requireCsrf(req, res, next);
  next();
}
