// Upload routes. Mounted at /api/uploads.
import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { buildUploadSignature } from '../lib/cloudinary.js';

const router = Router();

router.get(
  '/sign',
  requireAuth,
  requireRole('staff'),
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(buildUploadSignature(req.user.orgId));
  })
);

export default router;
