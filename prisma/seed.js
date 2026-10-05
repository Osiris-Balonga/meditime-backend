import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';

if (env.NODE_ENV === 'production' && !process.argv.includes('--production')) {
  throw new Error('Seed de production refusé sans le paramètre explicite --production.');
}

const specialties = [
  ['medecine-generale', 'Médecine générale'], ['cardiologie', 'Cardiologie'],
  ['dermatologie', 'Dermatologie'], ['pediatrie', 'Pédiatrie'],
  ['gynecologie', 'Gynécologie'], ['dentiste', 'Dentiste'],
];

function demoId(key) {
  const hex = createHash('sha256').update(`meditime-persona:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function loadPeople(file) {
  const fixture = JSON.parse(await readFile(new URL(`./fixtures/${file}.json`, import.meta.url), 'utf8'));
  for (const person of fixture.results) {
    if (person.nationality !== 'CG' || person.location.country.code !== 'CG'
      || !person.email.endsWith('@yopmail.com') || !person.name.first || !person.name.last
      || !/^\d{4}-\d{2}-\d{2}$/.test(person.dob.date)) throw new Error(`Profil Persona invalide : ${file}.`);
  }
  return fixture.results;
}

async function upsertPerson(tx, person) {
  const data = {
    email: person.email,
    firstName: person.name.first, lastName: person.name.last,
    birthDate: new Date(`${person.dob.date}T00:00:00Z`), avatarUrl: person.picture?.medium ?? null,
    // Les numéros de repli Persona peuvent appartenir à de vrais abonnés.
    phone: null,
  };
  return tx.user.upsert({
    where: { id: demoId(person.id) }, update: data,
    create: { id: demoId(person.id), ...data, profileCompletedAt: new Date() },
  });
}

async function seedDoctor(person, index) {
  return prisma.$transaction(async (tx) => {
    const [slug, name] = specialties[index % specialties.length];
    const specialty = await tx.specialty.upsert({ where: { slug }, update: {}, create: { slug, name } });
    const user = await upsertPerson(tx, person);
    const doctor = await tx.doctorProfile.upsert({
      where: { userId: user.id }, update: {},
      create: {
        id: demoId(`doctor:${person.id}`), userId: user.id, specialtyId: specialty.id,
        practiceName: `Cabinet démo ${person.name.last} — ${person.location.city}`,
        address: `Adresse fictive : ${person.location.street ?? 'cabinet de démonstration'}`,
        city: person.location.city, postalCode: person.location.postcode,
        timezone: 'Africa/Brazzaville', consultationMinutes: 30, isApproved: true, published: true,
      },
    });
    for (let weekday = 1; weekday <= 5; weekday++) {
      await tx.weeklyAvailability.upsert({
        where: { doctorId_weekday_startMinute: { doctorId: doctor.id, weekday, startMinute: 540 } },
        update: {}, create: { doctorId: doctor.id, weekday, startMinute: 540, endMinute: 600 },
      });
    }
    const slots = [];
    for (let offset = 1; slots.length < 10 && offset <= 14; offset++) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() + offset);
      day.setUTCHours(8, 0, 0, 0); // 09:00 à Brazzaville.
      if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
      for (let part = 0; part < 2; part++) {
        const startsAt = new Date(day.getTime() + part * 30 * 60000);
        const endsAt = new Date(startsAt.getTime() + 30 * 60000);
        slots.push(await tx.slot.upsert({
          where: { doctorId_startsAt: { doctorId: doctor.id, startsAt } },
          update: {}, create: { doctorId: doctor.id, startsAt, endsAt, source: 'persona-demo' },
        }));
      }
    }
    return { doctor, slug, slots };
  }, { timeout: 30000 });
}

async function seed() {
  const patients = [];
  for (const group of ['child', 'teen', 'adult', 'senior']) {
    for (const gender of ['female', 'male']) {
      for (const person of await loadPeople(`patients-${group}-${gender}`)) {
        patients.push({ person, user: await upsertPerson(prisma, person) });
      }
    }
  }
  const doctors = [];
  for (const gender of ['female', 'male']) {
    for (const person of await loadPeople(`doctors-${gender}`)) {
      if (person.dob.age < 28 || person.dob.age > 70) throw new Error('Âge médecin incohérent.');
      doctors.push(await seedDoctor(person, doctors.length));
    }
  }
  for (const [index, { doctor, slug, slots }] of doctors.entries()) {
    const candidates = patients.filter(({ person }) => slug === 'pediatrie'
      ? ['child', 'teen'].includes(person.dob.ageGroup)
      : ['adult', 'senior'].includes(person.dob.ageGroup) && (slug !== 'gynecologie' || person.gender === 'female'));
    for (const [scenario, status] of ['PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED'].entries()) {
      const patient = candidates[(index + scenario) % candidates.length];
      await prisma.appointmentRequest.upsert({
        where: { id: demoId(`request:${doctor.id}:${status}`) }, update: {},
        create: {
          id: demoId(`request:${doctor.id}:${status}`), patientId: patient.user.id,
          slotId: slots[scenario].id, status,
          reason: `Consultation fictive de démonstration — ${specialties[index % specialties.length][1]}`,
          decidedAt: status === 'PENDING' ? null : new Date(),
        },
      });
    }
  }
  console.log('Persona : 24 patients (6 par tranche), 12 médecins, 120 créneaux et 48 demandes fictives. Comptes existants conservés.');
}

try { await seed(); } finally { await prisma.$disconnect(); }
