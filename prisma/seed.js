import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';

if (env.NODE_ENV === 'production') {
  throw new Error('Le seed de démonstration est réservé à la base de développement.');
}

const doctors = [
  ['joel', 'Nzoussi', 'cardiologie', 'Cardiologie'],
  ['claire', 'Mavoungou', 'medecine-generale', 'Médecine générale'],
  ['sophie', 'Mabiala', 'dermatologie', 'Dermatologie'],
  ['thomas', 'Moukoko', 'pediatrie', 'Pédiatrie'],
  ['camille', 'Ngoma', 'gynecologie', 'Gynécologie'],
  ['christian', 'Loubaki', 'dentiste', 'Dentiste'],
];

async function seed() {
  const slotsByDoctor = [];
  for (const [firstName, lastName, slug, name] of doctors) {
    const specialty = await prisma.specialty.upsert({ where: { slug }, update: {}, create: { slug, name } });
    const user = await prisma.user.upsert({
      where: { email: `${firstName}.${lastName.toLowerCase()}@example.test` },
      update: {},
      create: { email: `${firstName}.${lastName.toLowerCase()}@example.test`, firstName, lastName, profileCompletedAt: new Date() },
    });
    const doctor = await prisma.doctorProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id, specialtyId: specialty.id,
        practiceName: `Cabinet de démonstration ${lastName}`,
        address: 'Adresse fictive de démonstration', city: 'Brazzaville',
        isApproved: true, published: true,
      },
    });
    for (let weekday = 1; weekday <= 5; weekday++) {
      await prisma.weeklyAvailability.upsert({
        where: { doctorId_weekday_startMinute: { doctorId: doctor.id, weekday, startMinute: 540 } },
        update: {}, create: { doctorId: doctor.id, weekday, startMinute: 540, endMinute: 600 },
      });
    }
    const slots = [];
    for (let offset = 1; slots.length < 10 && offset <= 14; offset++) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() + offset);
      day.setUTCHours(8, 0, 0, 0); // 09:00 in Africa/Brazzaville.
      if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
      for (let part = 0; part < 2; part++) {
        const startsAt = new Date(day.getTime() + part * 30 * 60000);
        const endsAt = new Date(startsAt.getTime() + 30 * 60000);
        slots.push(await prisma.slot.upsert({
          where: { doctorId_startsAt: { doctorId: doctor.id, startsAt } },
          update: {}, create: { doctorId: doctor.id, startsAt, endsAt, source: 'demo' },
        }));
      }
    }
    slotsByDoctor.push(slots);
  }

  const patients = [];
  for (let index = 1; index <= 3; index++) {
    patients.push(await prisma.user.upsert({
      where: { email: `patient${index}@example.test` }, update: {},
      create: { email: `patient${index}@example.test`, firstName: 'Patient', lastName: `Démo ${index}`, profileCompletedAt: new Date() },
    }));
  }
  const scenarios = [
    [1, 0, 0, 'PENDING'], [2, 1, 0, 'PENDING'], [3, 2, 0, 'PENDING'],
    [4, 0, 1, 'CONFIRMED'], [5, 1, 2, 'DECLINED'], [6, 2, 3, 'CANCELLED'],
  ];
  for (const [number, patientIndex, slotIndex, status] of scenarios) {
    await prisma.appointmentRequest.upsert({
      where: { id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}` },
      update: {},
      create: {
        id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
        patientId: patients[patientIndex].id, slotId: slotsByDoctor[0][slotIndex].id, status,
        reason: 'Demande fictive de démonstration',
        decidedAt: status === 'PENDING' ? null : new Date(),
      },
    });
  }
  console.log('Démonstration prête : 6 médecins, 3 patients, 60 créneaux et 6 demandes fictives.');
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
