import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashValue, lockEmail, requireAuthConfig, sameSecret } from '../lib/auth-crypto.js';
import { HttpError } from '../middlewares/errors.js';
import { createSession, userSelect } from './session.service.js';
import { requireEmailConfig, sendEmailCode } from './email.service.js';

export const normalizedEmail = z.string().trim().toLowerCase().email().max(254);
const emailInput = z.object({ email: normalizedEmail }).strict();
const verifyInput = emailInput.extend({ code: z.string().regex(/^\d{6}$/) });
const OTP_DURATION_MS = 10 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;

export async function requestEmailCode(body) {
  const { email } = emailInput.parse(body);
  requireAuthConfig();
  requireEmailConfig();
  const id = randomUUID();
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await prisma.$transaction(async (tx) => {
    await lockEmail(tx, email);
    const now = new Date();
    const recent = await tx.emailChallenge.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
    const count = await tx.emailChallenge.count({ where: { email, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } } });
    if ((recent && now - recent.createdAt < RESEND_DELAY_MS) || count >= 5) {
      throw new HttpError(429, 'CODE_RATE_LIMITED', 'Attendez avant de demander un nouveau code.');
    }
    await tx.emailChallenge.updateMany({ where: { email, consumedAt: null }, data: { consumedAt: now } });
    await tx.emailChallenge.create({ data: {
      id, email, codeHash: hashValue('otp', `${id}:${email}:${code}`),
      expiresAt: new Date(now.getTime() + OTP_DURATION_MS), createdAt: now,
    } });
  }, { timeout: 15000 });

  try {
    await sendEmailCode(email, code, id);
  } catch (error) {
    await prisma.emailChallenge.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });
    throw error;
  }
  return { message: 'Un code de connexion a été envoyé.', expiresIn: 600, resendAfter: 60 };
}

export async function verifyEmailCode(body, previousSessionId) {
  const { email, code } = verifyInput.parse(body);
  requireAuthConfig();
  const result = await prisma.$transaction(async (tx) => {
    await lockEmail(tx, email);
    const now = new Date();
    const challenge = await tx.emailChallenge.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= 5) {
      return { invalid: true };
    }
    const valid = sameSecret(challenge.codeHash, hashValue('otp', `${challenge.id}:${email}:${code}`));
    await tx.emailChallenge.update({ where: { id: challenge.id }, data: {
      attempts: { increment: 1 },
      ...(valid || challenge.attempts >= 4 ? { consumedAt: now } : {}),
    } });
    if (!valid) return { invalid: true }; // Commit the failed attempt before returning the HTTP error.
    const user = await tx.user.upsert({ where: { email }, update: {}, create: { email }, select: userSelect });
    const session = await createSession(tx, user.id, previousSessionId);
    return { user, session };
  }, { timeout: 15000 });
  if (result.invalid) {
    throw new HttpError(400, 'INVALID_CODE', 'Code invalide, expiré ou déjà utilisé. Demandez un nouveau code si nécessaire.');
  }
  return result;
}
