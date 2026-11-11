import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { orgs, users, locations } from '../db/schema.js';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { COOKIE_NAME, cookieOptions, signToken } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.js';

const router = Router();
const registerSchema = z.object({
  orgName: z.string().trim().min(1, 'Organization name is required').max(100, 'Too long (max 100)'),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254, 'Too long'),
  password: z.string().min(8, 'At least 8 characters').max(128, 'Too long (max 128)'),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required').max(128, 'Too long'),
});
let dummyHashPromise;
const getDummyHash = () => (dummyHashPromise ??= argon2.hash('not-a-real-password'));
const invalidLogin = () => new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
const isUniqueViolation = (err) => err?.code === '23505' || err?.cause?.code === '23505';

router.post('/register', registerLimiter, asyncHandler(async (req, res) => {
  const { orgName, email, password } = registerSchema.parse(req.body ?? {});
  const passwordHash = await argon2.hash(password);
  let result;
  try {
    result = await db.transaction(async (tx) => {
      const [org] = await tx.insert(orgs).values({ name: orgName }).returning();
      const [user] = await tx.insert(users)
        .values({ orgId: org.id, email, passwordHash, role: 'owner' }).returning();
      await tx.insert(locations).values({ orgId: org.id, name: 'Main store' });
      return { org, user };
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AppError(409, 'CONFLICT', 'An account with this email already exists', { email: 'Already registered' });
    throw err;
  }
  const { org, user } = result;
  res.status(201).json({
    org: { id: org.id, name: org.name },
    user: { id: user.id, email: user.email, role: user.role, orgId: user.orgId },
  });
}));

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body ?? {});
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let ok = false;
  try { ok = await argon2.verify(user ? user.passwordHash : await getDummyHash(), password); }
  catch { ok = false; }
  if (!user || !ok || !user.isActive) throw invalidLogin();
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions);
  res.json({ user: { id: user.id, email: user.email, role: user.role, orgId: user.orgId } });
}));

router.post('/logout', (_req, res) => {
  const { maxAge, ...clearOptions } = cookieOptions;
  res.clearCookie(COOKIE_NAME, clearOptions);
  res.status(204).end();
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const [row] = await db.select({
    id: users.id, email: users.email, role: users.role, isActive: users.isActive,
    orgId: orgs.id, orgName: orgs.name,
  }).from(users).innerJoin(orgs, eq(users.orgId, orgs.id))
    .where(and(eq(users.id, req.user.id), eq(users.orgId, req.user.orgId))).limit(1);
  if (!row || !row.isActive) {
    const { maxAge, ...clearOptions } = cookieOptions;
    res.clearCookie(COOKIE_NAME, clearOptions);
    throw new AppError(401, 'UNAUTHORIZED', 'Account not found or disabled');
  }
  res.json({
    user: { id: row.id, email: row.email, role: row.role, orgId: row.orgId },
    org: { id: row.orgId, name: row.orgName },
  });
}));

export default router;
