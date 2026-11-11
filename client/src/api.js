// Small fetch wrapper for the Express API. Same-origin (Vite proxies /api in dev), cookie auth.
// Errors from the server look like { error: { code, message, fields } } and become ApiError.

export class ApiError extends Error {
  constructor(status, code, message, fields = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// Listeners hear about every 401 so the app can send the user to the login page.
const unauthorizedListeners = new Set();
export function onUnauthorized(fn) {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

// Slow-request tracking, for the "waking up the server" message (Neon and Render free tiers sleep
// when idle). When the first request starts, a timer begins; if requests are still pending after
// SLOW_MS the app is told the server is slow, and it is told again when everything has finished.
export const SLOW_MS = 3000;
let pending = 0;
let slow = false;
let slowTimer = null;
const slowListeners = new Set();

function setSlow(value) {
  if (slow === value) return;
  slow = value;
  slowListeners.forEach((fn) => fn());
}
function requestStarted() {
  if (pending++ === 0) slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
}
function requestFinished() {
  if (--pending === 0) {
    clearTimeout(slowTimer);
    setSlow(false);
  }
}
// For React's useSyncExternalStore.
export function subscribeSlow(fn) {
  slowListeners.add(fn);
  return () => slowListeners.delete(fn);
}
export const getSlow = () => slow;

function buildUrl(path, query) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

// request('/products', { query: { q: 'abc' } }), request('/stock/receive', { method: 'POST', body: {...} })
// Pass `rawBody` with a `headers` Content-Type for non-JSON bodies (CSV import).
export async function request(path, { method = 'GET', query, body, rawBody, headers = {}, signal } = {}) {
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...headers }, signal };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  } else if (rawBody !== undefined) {
    init.body = rawBody;
  }

  let res;
  let data = null;
  requestStarted();
  try {
    try {
      res = await fetch(buildUrl(path, query), init);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
    }

    if (res.status === 204) return null;

    try {
      data = await res.json();
    } catch {
      // Non-JSON body (e.g. a proxy error page); fall through with data = null.
    }
  } finally {
    requestFinished();
  }

  if (!res.ok) {
    const e = data?.error;
    const err = new ApiError(res.status, e?.code || 'ERROR', e?.message || `Request failed (${res.status})`, e?.fields);
    if (res.status === 401) unauthorizedListeners.forEach((fn) => fn(err));
    throw err;
  }
  return data;
}

export const api = {
  get: (path, query, opts) => request(path, { ...opts, query }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};
