import { parseArgs } from 'node:util';
import { z } from 'zod';
import { prisma } from '../src/lib/prisma.js';

const { values } = parseArgs({ options: {
  email: { type: 'string' }, specialty: { type: 'string' }, practice: { type: 'string' },
  address: { type: 'string' }, city: { type: 'string' },
} });

try {
  const input = z.object({
    email: z.string().trim().toLowerCase().email(), specialty: z.string().min(1),
    practice: z.string().trim().min(1).max(150), address: z.string().trim().min(1).max(250),
    city: z.string().trim().min(1).max(100),
  }).parse(values);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: input.email } });
    const specialty = await tx.specialty.findUnique({ where: { slug: input.specialty } });
    if (!user?.profileCompletedAt) throw new Error('Le compte doit exister et avoir un profil complété.');
    if (!specialty) throw new Error('Cette spécialité n’existe pas dans la base configurée.');
    const data = {
      specialtyId: specialty.id, practiceName: input.practice,
      address: input.address, city: input.city, isApproved: true, published: true,
    };
    await tx.doctorProfile.upsert({ where: { userId: user.id }, update: data, create: { ...data, userId: user.id } });
  });
  console.log('Profil médecin autorisé dans la base configurée.');
} catch (error) {
  console.error(error instanceof z.ZodError ? 'Paramètres requis : --email --specialty --practice --address --city.' : error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
