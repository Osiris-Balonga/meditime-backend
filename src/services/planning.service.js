import { prisma } from '../lib/prisma.js';

export async function getDoctorPlanning(doctorId) {
  return prisma.slot.findMany({
    where: {
      doctorId,
      startsAt: {
        gte: new Date(),
      },
    },
    orderBy: {
      startsAt: 'asc',
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      source: true,
      requests: {
        select: {
          status: true,
        },
      },
    },
  });
}