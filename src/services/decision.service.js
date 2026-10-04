import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/errors.js";
import { presentRequest } from "../lib/appointmentPresenter.js";
import { lockSlot, TX_OPTIONS } from "./appointment.service.js";

// Un profil médecin ne donne des droits que s'il est approuvé.
export async function getApprovedDoctor(userId) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { userId } });
  if (!doctor)
    throw new HttpError(
      403,
      "NOT_A_DOCTOR",
      "Cette action est réservée aux médecins.",
    );
  if (!doctor.isApproved)
    throw new HttpError(
      403,
      "DOCTOR_NOT_APPROVED",
      "Votre profil médecin n’est pas encore approuvé.",
    );
  return doctor;
}

const doctorRequestInclude = {
  slot: true,
  patient: {
    select: { id: true, firstName: true, lastName: true, phone: true },
  },
};

// #10 — liste des demandes reçues par le médecin connecté.
export async function listDoctorRequests(userId, { status, limit, page }) {
  const doctor = await getApprovedDoctor(userId);
  const where = { slot: { doctorId: doctor.id }, ...(status && { status }) };
  const [items, total] = await Promise.all([
    prisma.appointmentRequest.findMany({
      where,
      include: doctorRequestInclude,
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

// #10 — confirmer ou refuser. Tout se passe dans une transaction, sous verrou du créneau.
export async function decideRequest(userId, requestId, decision) {
  const doctor = await getApprovedDoctor(userId);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const found = await tx.appointmentRequest.findUnique({
        where: { id: requestId },
        include: { slot: true },
      });
      // 404 aussi quand la demande appartient à un autre médecin : on ne révèle pas son existence.
      if (!found || found.slot.doctorId !== doctor.id) {
        throw new HttpError(
          404,
          "REQUEST_NOT_FOUND",
          "Cette demande est introuvable.",
        );
      }
      await lockSlot(tx, found.slotId);

      // Relecture sous verrou : l'état a pu changer pendant l'attente du verrou.
      const request = await tx.appointmentRequest.findUnique({
        where: { id: requestId },
        include: { slot: true },
      });
      if (request.status !== "PENDING") {
        throw new HttpError(
          409,
          "INVALID_STATUS",
          "Seule une demande en attente peut être traitée.",
        );
      }
      const now = new Date();

      if (decision === "decline") {
        return tx.appointmentRequest.update({
          where: { id: requestId },
          data: {
            status: "DECLINED",
            decidedAt: now,
            decisionCode: "DECLINED_BY_DOCTOR",
          },
          include: doctorRequestInclude,
        });
      }

      if (request.slot.status !== "AVAILABLE")
        throw new HttpError(409, "SLOT_BLOCKED", "Ce créneau est bloqué.");
      if (request.slot.startsAt <= now)
        throw new HttpError(409, "SLOT_PAST", "Ce créneau est déjà passé.");
      const alreadyConfirmed = await tx.appointmentRequest.count({
        where: { slotId: request.slotId, status: "CONFIRMED" },
      });
      if (alreadyConfirmed > 0)
        throw new HttpError(
          409,
          "SLOT_ALREADY_CONFIRMED",
          "Un rendez-vous est déjà confirmé sur ce créneau.",
        );

      const confirmed = await tx.appointmentRequest.update({
        where: { id: requestId },
        data: {
          status: "CONFIRMED",
          decidedAt: now,
          decisionCode: "CONFIRMED_BY_DOCTOR",
        },
        include: doctorRequestInclude,
      });
      // Les autres demandes en attente sur ce créneau ne peuvent plus aboutir.
      await tx.appointmentRequest.updateMany({
        where: {
          slotId: request.slotId,
          status: "PENDING",
          id: { not: requestId },
        },
        data: {
          status: "DECLINED",
          decidedAt: now,
          decisionCode: "SLOT_TAKEN",
        },
      });
      return confirmed;
    }, TX_OPTIONS);
    return presentRequest(updated);
  } catch (error) {
    // Filet de sécurité : l'index unique SQL refuse une 2e confirmation sur le même créneau.
    if (error?.code === "P2002") {
      throw new HttpError(
        409,
        "SLOT_ALREADY_CONFIRMED",
        "Un rendez-vous est déjà confirmé sur ce créneau.",
      );
    }
    throw error;
  }
}
