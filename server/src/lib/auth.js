// JWT + cookie helpers. The token lives in an httpOnly cookie so page
// JavaScript (and therefore XSS) can never read it.
import jwt from 'jsonwebtoken';
import { requireEnv } from '../config.js';

export const COOKIE_NAME = 'token';
const SESSION_DAYS = 7;
const isProd = process.env.NODE_ENV === 'production';

const JWT_SECRET = requireEnv('JWT_SECRET');
if (isProd && (JWT_SECRET === 'change-me' || JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET is too weak for production. Use e.g. `openssl rand -hex 32`.');
}

export function signToken(user) {
  return jwt.sign({ orgId: user.orgId, role: user.role }, JWT_SECRET, {
    subject: user.id,
    expiresIn: `${SESSION_DAYS}d`,
    algorithm: 'HS256',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

export const cookieOptions = {
  httpOnly: true,
  secure: isProd, // Render serves HTTPS; allow plain http on localhost
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
};
