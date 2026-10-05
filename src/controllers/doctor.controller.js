import { asyncHandler } from "../lib/asyncHandler.js";
import { parseSearchQuery, parseSlotRange } from "../lib/doctorValidation.js";
import { requireUuid } from "../lib/validation.js";
import * as doctors from "../services/doctor.service.js";

// #6 — endpoints publics (lecture seule)
export const specialties = asyncHandler(async (req, res) => {
  res.json({ data: await doctors.listSpecialties() });
});
export const search = asyncHandler(async (req, res) => {
  res.json({ data: await doctors.searchDoctors(parseSearchQuery(req.query)) });
});
export const profile = asyncHandler(async (req, res) => {
  res.json({ data: await doctors.getDoctor(requireUuid(req.params.id, "id")) });
});
export const slots = asyncHandler(async (req, res) => {
  const id = requireUuid(req.params.id, "id");
  res.json({
    data: await doctors.listDoctorSlots(id, (timeZone) =>
      parseSlotRange(req.query, timeZone),
    ),
  });
});
