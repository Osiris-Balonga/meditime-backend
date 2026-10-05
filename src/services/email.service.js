import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { HttpError } from '../middlewares/errors.js';

export function requireEmailConfig() {
  const configured = env.EMAIL_PROVIDER === 'gmail'
    ? env.GMAIL_USER && env.GMAIL_APP_PASSWORD
    : env.EMAIL_API_KEY && env.EMAIL_FROM;
  if (!configured) {
    throw new HttpError(503, 'EMAIL_NOT_CONFIGURED', 'L’envoi des codes email n’est pas encore configuré.');
  }
}

let gmailTransport;

export async function sendEmailCode(email, code, challengeId) {
  requireEmailConfig();
  const subject = 'Votre code de connexion MediTime';
  const text = `Votre code MediTime est ${code}. Il expire dans 10 minutes. Ne le partagez avec personne. Si vous n’avez pas demandé ce code, ignorez cet email.`;
  if (env.EMAIL_PROVIDER === 'gmail') {
    gmailTransport ||= nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      await gmailTransport.sendMail({
        from: { name: 'MediTime', address: env.GMAIL_USER },
        to: email,
        subject,
        text,
      });
    } catch {
      throw new HttpError(503, 'EMAIL_UNAVAILABLE', 'Impossible d’envoyer le code. Réessayez plus tard.');
    }
    return;
  }
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `meditime-otp-${challengeId}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM, to: [email], subject, text,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new HttpError(503, 'EMAIL_UNAVAILABLE', 'Impossible d’envoyer le code. Réessayez plus tard.');
  }
  if (!response.ok) {
    throw new HttpError(503, 'EMAIL_UNAVAILABLE', 'Impossible d’envoyer le code. Réessayez plus tard.');
  }
}
