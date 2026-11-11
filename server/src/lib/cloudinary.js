// Cloudinary signed uploads, done with node:crypto (no SDK needed just to sign).
// The browser uploads straight to Cloudinary; the server only hands out a short-lived
// signature. The API secret never leaves the server (docs/deployment.md).
import crypto from 'node:crypto';
import { AppError } from '../middleware/errors.js';

// Signature = SHA-1 hex of "k1=v1&k2=v2" (keys sorted A-Z, empty values dropped) + api_secret.
// Do not include file, cloud_name, resource_type, or api_key in the signed params.
export function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

// Read at request time (not at boot) so the server still starts without Cloudinary set up.
export function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    console.error('Cloudinary env vars are not fully set');
    throw new AppError(503, 'UNAVAILABLE', 'Image uploads are not configured on this server');
  }
  return { cloudName, apiKey, apiSecret };
}

// Each org uploads only into its own folder, and only common image formats.
export function buildUploadSignature(orgId, now = Date.now()) {
  const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
  const params = {
    allowed_formats: 'jpg,jpeg,png,webp',
    folder: `inventory/${orgId}/products`,
    timestamp: Math.floor(now / 1000),
  };
  return {
    cloudName,
    apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    // The browser must send these exactly as given, plus file, api_key, and signature.
    params,
    signature: signParams(params, apiSecret),
  };
}

// Checks the image fields a client sends with a product, so nobody can attach an arbitrary
// link or another org's image. Both fields must be sent together; null for both clears the image.
// Call it only when at least one of the two was sent.
export function assertOrgImage(orgId, { imageUrl, imagePublicId }) {
  const fail = (fields) => {
    throw new AppError(400, 'VALIDATION', 'Invalid input', fields);
  };

  if (imageUrl === undefined || imagePublicId === undefined) {
    fail({ [imageUrl === undefined ? 'imageUrl' : 'imagePublicId']: 'Send imageUrl and imagePublicId together' });
  }
  if (imageUrl === null && imagePublicId === null) return; // clearing the image
  if (imageUrl === null) fail({ imageUrl: 'Required when imagePublicId is set' });
  if (imagePublicId === null) fail({ imagePublicId: 'Required when imageUrl is set' });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    console.error('CLOUDINARY_CLOUD_NAME is not set');
    throw new AppError(503, 'UNAVAILABLE', 'Image uploads are not configured on this server');
  }

  // Must be inside this org's folder (the same one /uploads/sign signs).
  const prefix = `inventory/${orgId}/products/`;
  if (!imagePublicId.startsWith(prefix) || !/^[A-Za-z0-9_\-/]+$/.test(imagePublicId) || imagePublicId.includes('//')) {
    fail({ imagePublicId: 'Not an image from this organization' });
  }

  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    return fail({ imageUrl: 'Not a valid URL' });
  }
  const base = `/${cloudName}/image/upload/`;
  const path = url.pathname;
  const at = path.indexOf(`/${imagePublicId}`);
  const after = at === -1 ? '' : path.charAt(at + 1 + imagePublicId.length);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'res.cloudinary.com' ||
    url.search ||
    !path.startsWith(base) ||
    at === -1 ||
    (after !== '' && after !== '.')
  ) {
    fail({ imageUrl: 'Must be the Cloudinary URL of the uploaded image' });
  }
}
