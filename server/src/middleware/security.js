// Security headers (helmet) and CORS (task 62).
import helmet from 'helmet';
import cors from 'cors';

const isProd = process.env.NODE_ENV === 'production';

// helmet's defaults plus the three outside hosts the app really uses:
//   Google Fonts   Inter (stylesheet from googleapis, font files from gstatic)
//   Cloudinary     product images (res.cloudinary.com) and direct browser
//                  uploads (api.cloudinary.com)
// Everything else is same-origin. Inline styles stay allowed (helmet's default)
// because React `style` props and recharts need them; scripts stay locked to
// our own files. The camera for barcode scanning is not a CSP matter.
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'style-src': ["'self'", 'https:', "'unsafe-inline'"],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
        'connect-src': ["'self'", 'https://api.cloudinary.com'],
        // Only meaningful over https. Left off when testing production mode on
        // plain http://localhost, where it would break every asset in Safari.
        'upgrade-insecure-requests': isProd ? [] : null,
      },
    },
  });
}

// Production is same-origin (Express serves the built app), so by default no
// CORS headers are sent and browsers refuse cross-origin calls to the API.
// In dev, Vite proxies /api, so CORS is rarely needed either; set CLIENT_ORIGIN
// (comma-separated for several) only to call the API from another origin.
export function corsMiddleware() {
  const origins = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (origins.length === 0) return (_req, _res, next) => next();
  return cors({ origin: origins, credentials: true });
}
