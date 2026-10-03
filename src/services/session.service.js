import { env } from '../config/env.js';
import { hashValue, newSessionToken } from '../lib/auth-crypto.js';

export const SESSION_COOKIE = env.NODE_ENV === 'production' ? '__Host-meditime_session' : 'meditime_session';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const userSelect = {
  id: true, email: true, firstName: true, lastName: true, phone: true,
  avatarUrl: true, profileCompletedAt: true,
  doctorProfile: { select: { id: true, isApproved: true } },
};

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.sessionSameSite,
  path: '/',
};

export async function createSession(tx, userId, previousSessionId) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  if (previousSessionId) {
    await tx.session.updateMany({ where: { id: previousSessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await tx.session.create({ data: { userId, tokenHash: hashValue('session', token), expiresAt } });
  return { token, expiresAt };
}

export function accountResponse(user) {
  const approvedDoctor = user.doctorProfile?.isApproved === true;
  return {
    user: {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      phone: user.phone, avatarUrl: user.avatarUrl,
      profileCompleted: Boolean(user.profileCompletedAt),
    },
    allowedModes: approvedDoctor ? ['patient', 'doctor'] : ['patient'],
    doctorProfileId: approvedDoctor ? user.doctorProfile.id : null,
  };
}

export function sendSession(res, result) {
  res.cookie(SESSION_COOKIE, result.session.token, { ...cookieOptions, expires: result.session.expiresAt });
  res.set('Cache-Control', 'no-store');
  res.json({
    ...accountResponse(result.user),
    csrfToken: hashValue('csrf', result.session.token),
    expiresAt: result.session.expiresAt,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}
