import { prisma } from '../lib/prisma.js';
import { requestEmailCode, verifyEmailCode } from '../services/auth-email.service.js';
import { clearSessionCookie, sendSession } from '../services/session.service.js';
import { signInWithGoogle } from '../services/auth-google.service.js';

export async function requestEmail(req, res) {
  res.set('Cache-Control', 'no-store');
  res.status(202).json(await requestEmailCode(req.body));
}

export async function verifyEmail(req, res) {
  sendSession(res, await verifyEmailCode(req.body, req.auth?.sessionId));
}

export async function google(req, res) {
  sendSession(res, await signInWithGoogle(req.body, req.auth));
}

export async function logout(req, res) {
  if (req.auth) {
    await prisma.session.updateMany({ where: { id: req.auth.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  clearSessionCookie(res);
  res.status(204).end();
}
