// Reads the session cookie, verifies the JWT, and sets req.user.
// Every tenant query must filter on req.user.orgId (never on a client-sent org id).
import { COOKIE_NAME, verifyToken } from '../lib/auth.js';
import { AppError } from './errors.js';

export function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(new AppError(401, 'UNAUTHORIZED', 'Please log in'));

  try {
    const payload = verifyToken(token);
    if (!payload.sub || !payload.orgId || !payload.role) throw new Error('incomplete token');
    req.user = { id: payload.sub, orgId: payload.orgId, role: payload.role };
    next();
  } catch {
    // Expired, tampered, or malformed: same answer for all of them.
    next(new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again'));
  }
}
