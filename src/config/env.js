import 'dotenv/config';
import { z } from 'zod';

const parsed = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url().refine((value) => /^postgres(ql)?:/.test(value)),
  FRONTEND_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
  SESSION_SECRET: z.preprocess((value) => value || undefined, z.string().min(32).optional()),
  SESSION_SAME_SITE: z.preprocess((value) => value || undefined, z.enum(['lax', 'strict', 'none']).optional()),
  GOOGLE_CLIENT_ID: z.preprocess((value) => value || undefined, z.string().max(512).optional()),
  EMAIL_API_KEY: z.preprocess((value) => value || undefined, z.string().optional()),
  EMAIL_FROM: z.preprocess((value) => value || undefined, z.string().max(254).optional()),
}).safeParse(process.env);

if (!parsed.success) {
  const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ');
  throw new Error(`Configuration invalide : ${fields}. Vérifiez votre fichier .env.`);
}

export const env = {
  ...parsed.data,
  frontendOrigins: parsed.data.FRONTEND_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  sessionSameSite: parsed.data.SESSION_SAME_SITE || (parsed.data.NODE_ENV === 'production' ? 'none' : 'lax'),
};

if (env.sessionSameSite === 'none' && env.NODE_ENV !== 'production') {
  throw new Error('SESSION_SAME_SITE=none nécessite HTTPS en production. Utilisez lax en local.');
}
