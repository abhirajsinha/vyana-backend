import rateLimit from "express-rate-limit";

/** Brute-force protection for credential endpoints. */
export const authLoginRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, try again later." },
});

/** Limits chat / LLM cost abuse (per IP). */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});
