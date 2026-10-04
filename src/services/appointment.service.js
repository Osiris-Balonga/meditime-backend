import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/errors.js";
import { presentRequest } from "../lib/appointmentPresenter.js";
export const TX_OPTIONS = { maxWait: 10000, timeout: 30000 };

export const requestInclude = {
  slot: { include: { doctor: { include: { user: true, specialty: true } } } },
};

// Verrou de ligne : sérialise les demandes et décisions concurrentes sur un même créneau.
export async function lockSlot(tx, slotId) {
  const rows =
    await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${slotId}::uuid FOR UPDATE`;
  return rows.length > 0;
}

// #9 — le patient envoie une demande sur un créneau.
export async function createRequest(patientId, { slotId, reason }) {
  const created = await prisma.$transaction(async (tx) => {
    if (!(await lockSlot(tx, slotId)))
      throw new HttpError(404, "SLOT_NOT_FOUND", "Ce créneau est introuvable.");
    const slot = await tx.slot.findUnique({
      where: { id: slotId },
      include: { doctor: true },
    });

    // Un médecin non approuvé ou non publié n'existe pas pour le public.
    if (!slot.doctor.isApproved || !slot.doctor.published) {
      throw new HttpError(404, "SLOT_NOT_FOUND", "Ce créneau est introuvable.");
    }
    if (slot.doctor.userId === patientId) {
      throw new HttpError(
        403,
        "OWN_SLOT",
        "Vous ne pouvez pas demander un de vos propres créneaux.",
      );
    }
    if (slot.status !== "AVAILABLE")
      throw new HttpError(
        409,
        "SLOT_UNAVAILABLE",
        "Ce créneau n’est plus disponible.",
      );
    if (slot.startsAt <= new Date())
      throw new HttpError(409, "SLOT_PAST", "Ce créneau est déjà passé.");

    const active = await tx.appointmentRequest.findMany({
      where: { slotId, status: { in: ["PENDING", "CONFIRMED"] } },
      select: { patientId: true, status: true },
    });
    if (active.some((r) => r.status === "CONFIRMED")) {
      throw new HttpError(
        409,
        "SLOT_UNAVAILABLE",
        "Ce créneau n’est plus disponible.",
      );
    }
    if (active.some((r) => r.patientId === patientId)) {
      throw new HttpError(
        409,
        "DUPLICATE_REQUEST",
        "Vous avez déjà une demande en attente sur ce créneau.",
      );
    }
    return tx.appointmentRequest.create({
      data: { slotId, patientId, reason },
      include: requestInclude,
    });
  });
  return presentRequest(created);
}

// #9 — suivi des demandes du patient connecté.
export async function listPatientRequests(patientId, { status, limit, page }) {
  const where = { patientId, ...(status && { status }) };
  const [items, total] = await Promise.all([
    prisma.appointmentRequest.findMany({
      where,
      include: requestInclude,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.appointmentRequest.count({ where }),
  ]);
  const now = new Date();
  return {
    items: items.map((r) => presentRequest(r, now)),
    page,
    limit,
    total,
  };
}

// #9 — annulation par le patient (demande en attente uniquement).
export async function cancelRequest(patientId, requestId) {
  // updateMany conditionnel = atomique : pas de fenêtre entre « vérifier » et « modifier ».
  const { count } = await prisma.appointmentRequest.updateMany({
    where: { id: requestId, patientId, status: "PENDING" },
    data: {
      status: "CANCELLED",
      decidedAt: new Date(),
      decisionCode: "CANCELLED_BY_PATIENT",
    },
  });
  if (count === 0) {
    const exists = await prisma.appointmentRequest.findFirst({
      where: { id: requestId, patientId },
      select: { id: true },
    });
    if (!exists)
      throw new HttpError(
        404,
        "REQUEST_NOT_FOUND",
        "Cette demande est introuvable.",
      );
    throw new HttpError(
      409,
      "INVALID_STATUS",
      "Seule une demande en attente peut être annulée.",
    );
  }
  const request = await prisma.appointmentRequest.findUnique({
    where: { id: requestId },
    include: requestInclude,
  });
  return presentRequest(request);
}
