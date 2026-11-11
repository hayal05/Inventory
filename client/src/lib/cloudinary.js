import { api } from '../api.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export function checkImageFile(file) {
  if (!IMAGE_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return 'The image is too large (max 5 MB).';
  return '';
}
export function optimizedUrl(url, transform = 'f_auto,q_auto,w_400') {
  if (!url) return url;
  const marker = '/image/upload/';
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const head = url.slice(0, i + marker.length);
  const tail = url.slice(i + marker.length);
  return tail.startsWith(`${transform}/`) ? url : `${head}${transform}/${tail}`;
}
export async function uploadProductImage(file) {
  const sign = await api.get('/uploads/sign');
  const body = new FormData();
  for (const [k, v] of Object.entries(sign.params)) body.append(k, String(v));
  body.append('api_key', sign.apiKey);
  body.append('signature', sign.signature);
  body.append('file', file);
  let res;
  try { res = await fetch(sign.uploadUrl, { method: 'POST', body }); }
  catch { throw new Error('Could not reach the image service. Check your connection and try again.'); }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.secure_url) {
    throw new Error(data?.error?.message || `Image upload failed (${res.status}).`);
  }
  return { imageUrl: data.secure_url, imagePublicId: data.public_id };
}
