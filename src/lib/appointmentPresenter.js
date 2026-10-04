// Convertit les enums Prisma (PENDING) en statuts API (pending) et déduit « passé » de la date.
const fullName = (user) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ") || null;

export function presentRequest(request, now = new Date()) {
  const { slot } = request;
  const out = {
    id: request.id,
    status: request.status.toLowerCase(),
    reason: request.reason,
    decisionCode: request.decisionCode,
    decidedAt: request.decidedAt,
    createdAt: request.createdAt,
    slot: {
      id: slot.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      isPast: slot.endsAt <= now,
    },
  };
  if (slot.doctor) {
    const d = slot.doctor;
    out.doctor = {
      id: d.id,
      name: d.user ? fullName(d.user) : null,
      specialty: d.specialty?.name ?? null,
      practiceName: d.practiceName,
      address: d.address,
      city: d.city,
      timezone: d.timezone,
    };
  }
  if (request.patient) {
    out.patient = {
      id: request.patient.id,
      firstName: request.patient.firstName,
      lastName: request.patient.lastName,
      // Le téléphone n'est partagé qu'une fois le rendez-vous confirmé.
      phone: request.status === "CONFIRMED" ? request.patient.phone : null,
    };
  }
  return out;
}
