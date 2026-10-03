import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middlewares/errors.js';
import { guardApiWrites } from './middlewares/request-security.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: env.frontendOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'meditime-backend' });
});

app.get('/ready', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'unavailable' });
  }
});

app.use('/api/v1', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, guardApiWrites, routes);
app.use(notFound);
app.use(errorHandler);
