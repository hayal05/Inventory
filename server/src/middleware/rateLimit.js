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
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', message)),
  });
}

export const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Try again in a few minutes.',
});

export const registerLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: 'Too many sign-ups from this network. Try again later.',
});
