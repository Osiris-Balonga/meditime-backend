export async function lockDoctor(tx, doctorId) {
  // Use the same lock in availability and appointment mutations.
  await tx.$executeRaw`SELECT "id" FROM "DoctorProfile" WHERE "id" = ${doctorId}::uuid FOR UPDATE`;
}
