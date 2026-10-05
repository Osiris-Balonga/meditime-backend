import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { HttpError } from "./errors.js";

export function guardApiWrites(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("Origin");
  if (
    (origin && !env.frontendOrigins.includes(origin)) ||
    (!origin && req.get("Sec-Fetch-Site") === "cross-site")
  ) {
    throw new HttpError(
      403,
      "ORIGIN_NOT_ALLOWED",
      "Cette origine n’est pas autorisée.",
    );
  }
  const hasBody =
    req.headers["transfer-encoding"] !== undefined ||
    Number(req.headers["content-length"]) > 0;
  if (hasBody && !req.is("application/json")) {
    throw new HttpError(
      415,
      "JSON_REQUIRED",
      "Envoyez un corps JSON avec Content-Type: application/json.",
    );
  }
  next();
}

function ipLimit(limit, windowMs) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Trop de demandes. Réessayez plus tard.",
      },
    },
  });
}

export const emailRequestLimit = ipLimit(10, 10 * 60 * 1000);
export const authVerificationLimit = ipLimit(30, 10 * 60 * 1000);
