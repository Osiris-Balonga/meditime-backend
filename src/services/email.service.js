import { env } from '../config/env.js';
import { HttpError } from '../middlewares/errors.js';

export function requireEmailConfig() {
  if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
    throw new HttpError(503, 'EMAIL_NOT_CONFIGURED', 'L’envoi des codes email n’est pas encore configuré.');
  }
}

export async function sendEmailCode(email, code, challengeId) {
  requireEmailConfig();
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
        from: env.EMAIL_FROM, to: [email], subject: 'Votre code de connexion MediTime',
        text: `Votre code MediTime est ${code}. Il expire dans 10 minutes. Ne le partagez avec personne. Si vous n’avez pas demandé ce code, ignorez cet email.`,
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
