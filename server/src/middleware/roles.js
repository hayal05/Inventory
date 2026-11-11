// Role guard. Use after requireAuth:
//   router.post('/products', requireAuth, requireRole('staff'), handler)
// Roles form a ladder (viewer < staff < owner) and requireRole(x) means
// "x or higher", matching the "staff+" notation in docs/architecture.md.
import { AppError } from './errors.js';

const RANK = { viewer: 1, staff: 2, owner: 3 };

export function requireRole(minRole) {
  // Fail at startup, not at request time, if a route is wired with a typo.
  if (!RANK[minRole]) throw new Error(`requireRole: unknown role "${minRole}"`);

  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHORIZED', 'Please log in'));
    // Unknown roles in a token rank 0, so they are always refused.
    if ((RANK[req.user.role] ?? 0) < RANK[minRole]) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do this'));
    }
    next();
  };
}
