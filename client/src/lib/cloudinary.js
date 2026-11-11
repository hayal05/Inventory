// Browser side of image handling: direct upload to Cloudinary (signed by our server, task 21)
// and the optimised display URL. No secret is ever in the browser.
import { api } from '../api.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Returns an error message for a file we will not upload, or '' if it is fine.
export function checkImageFile(file) {
  if (!IMAGE_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return 'The image is too large (max 5 MB).';
  return '';
}

// Inserts a transformation into a Cloudinary delivery URL, e.g.
// optimizedUrl(url) -> .../image/upload/f_auto,q_auto,w_400/v123/... (smaller, modern format, 400 px wide).
// Anything that is not a Cloudinary upload URL is returned unchanged.
export function optimizedUrl(url, transform = 'f_auto,q_auto,w_400') {
  if (!url) return url;
  const marker = '/image/upload/';
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const head = url.slice(0, i + marker.length);
  const tail = url.slice(i + marker.length);
  return tail.startsWith(`${transform}/`) ? url : `${head}${transform}/${tail}`;
}

// Uploads a file straight to Cloudinary. Resolves { imageUrl, imagePublicId } for the product API.
export async function uploadProductImage(file) {
  const sign = await api.get('/uploads/sign'); // { cloudName, apiKey, uploadUrl, params, signature }

  // Send the signed params exactly as given, plus api_key, signature and the file.
  const body = new FormData();
  for (const [k, v] of Object.entries(sign.params)) body.append(k, String(v));
  body.append('api_key', sign.apiKey);
  body.append('signature', sign.signature);
  body.append('file', file);

  let res;
  try {
    res = await fetch(sign.uploadUrl, { method: 'POST', body });
  } catch {
    throw new Error('Could not reach the image service. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.secure_url) {
    throw new Error(data?.error?.message || `Image upload failed (${res.status}).`);
  }
  return { imageUrl: data.secure_url, imagePublicId: data.public_id };
}
