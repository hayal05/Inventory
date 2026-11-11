// Upload routes. Mounted at /api/uploads.
import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { buildUploadSignature } from '../lib/cloudinary.js';

const router = Router();

// GET /api/uploads/sign (staff and owner)
// Returns what the browser needs to upload one product image directly to Cloudinary.
// Cloudinary rejects signatures older than about an hour, so request a fresh one per upload.
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
