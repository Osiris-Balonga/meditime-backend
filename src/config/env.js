import 'dotenv/config';
import { z } from 'zod';

const parsed = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url().refine((value) => /^postgres(ql)?:/.test(value)),
  FRONTEND_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
}).safeParse(process.env);

if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Configuration invalide : ${fields}. Vérifiez votre fichier .env.`);
}

export const env = {
  ...parsed.data,
  frontendOrigins: parsed.data.FRONTEND_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
};
