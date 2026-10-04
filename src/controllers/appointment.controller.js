import { HttpError } from "../middlewares/errors.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { parseListQuery, parseReason, requireUuid } from "../lib/validation.js";
import * as appointments from "../services/appointment.service.js";
import * as decisions from "../services/decision.service.js";
import * as dashboard from "../services/dashboard.service.js";

const body = (req) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Le corps de la requête doit être un objet JSON.",
    );
  }
  return req.body;
};

// #9
export const create = asyncHandler(async (req, res) => {
  const { slotId, reason } = body(req);
  const data = await appointments.createRequest(req.auth.userId, {
    slotId: requireUuid(slotId, "slotId"),
    reason: parseReason(reason),
  });
  res.status(201).json({ data });
});
export const listMine = asyncHandler(async (req, res) => {
  res.json({
    data: await appointments.listPatientRequests(
      req.auth.userId,
      parseListQuery(req.query),
    ),
  });
});
export const cancel = asyncHandler(async (req, res) => {
  res.json({
    data: await appointments.cancelRequest(
      req.auth.userId,
      requireUuid(req.params.id, "id"),
    ),
  });
});

// #10
export const listForDoctor = asyncHandler(async (req, res) => {
  res.json({
    data: await decisions.listDoctorRequests(
      req.auth.userId,
      parseListQuery(req.query),
    ),
  });
});
export const decide = (decision) =>
  asyncHandler(async (req, res) => {
    res.json({
      data: await decisions.decideRequest(
        req.auth.userId,
        requireUuid(req.params.id, "id"),
        decision,
      ),
    });
  });

// #11
export const patientDashboard = asyncHandler(async (req, res) => {
  res.json({ data: await dashboard.patientDashboard(req.auth.userId) });
});
export const doctorDashboard = asyncHandler(async (req, res) => {
  res.json({ data: await dashboard.doctorDashboard(req.auth.userId) });
});
