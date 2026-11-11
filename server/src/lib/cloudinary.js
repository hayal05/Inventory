import crypto from 'node:crypto';
import { AppError } from '../middleware/errors.js';

export function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}
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
    params,
    signature: signParams(params, apiSecret),
  };
}
export function assertOrgImage(orgId, { imageUrl, imagePublicId }) {
  const fail = (fields) => { throw new AppError(400, 'VALIDATION', 'Invalid input', fields); };
  if (imageUrl === undefined || imagePublicId === undefined)
    fail({ [imageUrl === undefined ? 'imageUrl' : 'imagePublicId']: 'Send imageUrl and imagePublicId together' });
  if (imageUrl === null && imagePublicId === null) return;
  if (imageUrl === null) fail({ imageUrl: 'Required when imagePublicId is set' });
  if (imagePublicId === null) fail({ imagePublicId: 'Required when imageUrl is set' });
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    console.error('CLOUDINARY_CLOUD_NAME is not set');
    throw new AppError(503, 'UNAVAILABLE', 'Image uploads are not configured on this server');
  }
  const prefix = `inventory/${orgId}/products/`;
  if (!imagePublicId.startsWith(prefix) || !/^[A-Za-z0-9_\-/]+$/.test(imagePublicId) || imagePublicId.includes('//'))
    fail({ imagePublicId: 'Not an image from this organization' });
  let url;
  try { url = new URL(imageUrl); }
  catch { return fail({ imageUrl: 'Not a valid URL' }); }
  const base = `/${cloudName}/image/upload/`;
  const path = url.pathname;
  const at = path.indexOf(`/${imagePublicId}`);
  const after = at === -1 ? '' : path.charAt(at + 1 + imagePublicId.length);
  if (
    url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.search ||
    !path.startsWith(base) || at === -1 || (after !== '' && after !== '.')
  ) fail({ imageUrl: 'Must be the Cloudinary URL of the uploaded image' });
}
