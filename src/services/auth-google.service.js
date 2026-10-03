import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { lockEmail, requireAuthConfig } from '../lib/auth-crypto.js';
import { HttpError } from '../middlewares/errors.js';
import { normalizedEmail } from './auth-email.service.js';
import { createSession, userSelect } from './session.service.js';

const client = new OAuth2Client();
const googleInput = z.object({ credential: z.string().min(20).max(8192) }).strict();

export async function signInWithGoogle(body, auth) {
  const { credential } = googleInput.parse(body);
  requireAuthConfig();
  if (!env.GOOGLE_CLIENT_ID) {
    throw new HttpError(503, 'GOOGLE_NOT_CONFIGURED', 'La connexion Google n’est pas encore configurée.');
  }
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'INVALID_GOOGLE_TOKEN', 'Le jeton Google est invalide ou expiré.');
  }
  if (!payload?.sub || typeof payload.sub !== 'string') {
    throw new HttpError(401, 'INVALID_GOOGLE_TOKEN', 'Le jeton Google est invalide.');
  }
  const emailResult = normalizedEmail.safeParse(payload.email);
  if (!emailResult.success || payload.email_verified !== true) {
    throw new HttpError(401, 'GOOGLE_EMAIL_UNVERIFIED', 'Google n’a pas vérifié cette adresse email.');
  }
  const email = emailResult.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await lockEmail(tx, email);
      const identity = await tx.authIdentity.findUnique({
        where: { provider_providerSubject: { provider: 'google', providerSubject: payload.sub } },
        include: { user: { select: userSelect } },
      });
      let user = identity?.user;
      if (user && auth && auth.userId !== user.id) {
        throw new HttpError(409, 'GOOGLE_ACCOUNT_CONFLICT', 'Cette identité Google appartient à un autre compte MediTime.');
      }
      if (!user) {
        user = await tx.user.findUnique({ where: { email }, select: userSelect });
        const authoritativeEmail = email.endsWith('@gmail.com') || Boolean(payload.hd);
        if (auth && (!user || auth.userId !== user.id)) {
          throw new HttpError(409, 'GOOGLE_EMAIL_MISMATCH', 'Utilisez l’identité Google correspondant à votre compte connecté.');
        }
        if (!authoritativeEmail && !auth) {
          throw new HttpError(409, 'EMAIL_VERIFICATION_REQUIRED', 'Connectez-vous avec le code envoyé à cette adresse, puis réessayez Google pour lier votre compte.');
        }
        if (!user) {
          user = await tx.user.create({ data: {
            email,
            firstName: typeof payload.given_name === 'string' ? payload.given_name.trim().slice(0, 80) || null : null,
            lastName: typeof payload.family_name === 'string' ? payload.family_name.trim().slice(0, 80) || null : null,
          }, select: userSelect });
        }
        await tx.authIdentity.create({ data: { userId: user.id, provider: 'google', providerSubject: payload.sub } });
      }
      return { user, session: await createSession(tx, user.id, auth?.sessionId) };
    }, { timeout: 15000 });
  } catch (error) {
    if (error.code === 'P2002') {
      throw new HttpError(409, 'GOOGLE_ACCOUNT_CONFLICT', 'Cette identité vient d’être liée. Réessayez la connexion.');
    }
    throw error;
  }
}
