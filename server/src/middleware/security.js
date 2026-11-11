// Security headers (helmet) and CORS (task 62).
import helmet from 'helmet';
import cors from 'cors';

const isProd = process.env.NODE_ENV === 'production';

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'style-src': ["'self'", 'https:', "'unsafe-inline'"],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
        'connect-src': ["'self'", 'https://api.cloudinary.com'],
        'upgrade-insecure-requests': isProd ? [] : null,
      },
    },
  });
}

export function corsMiddleware() {
  const origins = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (origins.length === 0) return (_req, _res, next) => next();
  return cors({ origin: origins, credentials: true });
}
