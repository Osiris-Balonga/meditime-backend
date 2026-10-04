import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middlewares/errors.js';
import { lockedDoctor } from './availability.service.js';
import { appointmentSelect, expireRequests, presentAppointment } from './appointment.service.js';

export async function decideAppointment(doctorId, id, accept, body) {
  z.uuid().parse(id);
  z.object({}).strict().parse(body ?? {});
  try {
    const result = await prisma.$transaction(async tx => {
      await lockedDoctor(tx, doctorId);
      const request = await tx.appointmentRequest.findFirst({ where: { id, slot: { doctorId } }, include: { slot: true } });
      if (!request) throw new HttpError(404, 'APPOINTMENT_NOT_FOUND', 'Cette demande n’est pas accessible.');
      await expireRequests(tx, { slot: { doctorId } });
      if (request.status !== 'PENDING' || request.slot.startsAt <= new Date()) return { conflict: true };
      if (accept && request.slot.status !== 'AVAILABLE') return { conflict: true };
      if (accept && await tx.appointmentRequest.findFirst({ where: { slotId: request.slotId, status: 'CONFIRMED' } })) return { conflict: true };
      const updated = await tx.appointmentRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: accept ? 'CONFIRMED' : 'DECLINED', decidedAt: new Date(), decisionCode: accept ? null : 'DOCTOR_DECLINED' } });
      if (!updated.count) return { conflict: true };
      if (accept) await tx.appointmentRequest.updateMany({ where: { slotId: request.slotId, status: 'PENDING' }, data: { status: 'DECLINED', decidedAt: new Date(), decisionCode: 'SLOT_TAKEN' } });
      return { appointment: presentAppointment(await tx.appointmentRequest.findUniqueOrThrow({ where: { id }, select: appointmentSelect })) };
    }, { timeout: 15000 });
    if (result.conflict) throw new HttpError(409, 'APPOINTMENT_CONFLICT', 'Cette demande ou ce créneau a changé. Rechargez la liste.');
    return result.appointment;
  } catch (error) {
    if (error.code === 'P2002') throw new HttpError(409, 'SLOT_TAKEN', 'Ce créneau est déjà confirmé pour une autre demande.');
    throw error;
  }
}
