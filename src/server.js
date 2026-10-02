import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';

await prisma.$connect();
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`MediTime API listening on port ${env.PORT}`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => {
    await prisma.$disconnect();
    clearTimeout(deadline);
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
