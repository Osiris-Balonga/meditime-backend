import { asyncHandler } from "../lib/asyncHandler.js";
import {
  parseExceptionBody,
  parseExceptionListQuery,
} from "../lib/doctorValidation.js";
import { requireUuid } from "../lib/validation.js";
import * as exceptions from "../services/exception.service.js";

// #8 — exceptions de disponibilité (médecin approuvé)
export const list = asyncHandler(async (req, res) => {
  res.json({
    data: await exceptions.listExceptions(
      req.auth.userId,
      parseExceptionListQuery(req.query),
    ),
  });
});
export const create = asyncHandler(async (req, res) => {
  res.status(201).json({
    data: await exceptions.createException(
      req.auth.userId,
      parseExceptionBody(req.body),
    ),
  });
});
export const remove = asyncHandler(async (req, res) => {
  res.json({
    data: await exceptions.deleteException(
      req.auth.userId,
      requireUuid(req.params.id, "id"),
    ),
  });
});
