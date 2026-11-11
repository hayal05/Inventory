// Rate limits for the auth routes (task 62).
// Counts are kept in memory, per IP. That is fine for one Render instance;
// a restart resets them, and a second instance would double the allowance.
// `trust proxy` is set in index.js, so req.ip is the real client, not Render's proxy.
import { rateLimit } from 'express-rate-limit';
import { AppError } from './errors.js';

function limiter({ windowMs, limit, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7', // RateLimit and RateLimit-Policy headers
    legacyHeaders: false,
    // Same JSON shape as every other error. express-rate-limit has already
    // set the Retry-After header by the time this runs.
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', message)),
  });
}

// Guessing passwords: 10 failed logins per 15 minutes per IP.
// Successful logins are not counted, so a shared office IP is not locked out
// by people who sign in correctly.
export const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Try again in a few minutes.',
});

// Creating accounts: 5 per hour per IP (each one also costs an argon2 hash).
export const registerLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: 'Too many sign-ups from this network. Try again later.',
});
