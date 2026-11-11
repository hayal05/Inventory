// Barcode scanning helpers. Native camera detection with ZXing fallback.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
const CAMERA = { video: { facingMode: { ideal: 'environment' } }, audio: false };
export function cleanCode(raw) {
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
}
export function pickScanMatch(code, items) {
  const wanted = cleanCode(code).toLowerCase();
  if (!wanted || !Array.isArray(items)) return null;
  for (const field of ['barcode', 'sku']) {
    const hits = items.filter((p) => cleanCode(p[field]).toLowerCase() === wanted);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}
export function describeScanError(err) {
  const name = err?.name;
  const code = err?.code;
  if (code === 'NO_CAMERA_API') return 'Camera scanning needs a secure (https) connection and a browser that can use the camera.';
  if (code === 'SCANNER_LOAD') return 'Could not load the barcode scanner. Check your connection and try again, or type the code instead.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera is busy or not responding. Close other apps that use it and try again.';
  return 'Could not start the camera. You can type the code instead.';
}
function scanError(code) { const e = new Error(code); e.code = code; return e; }
async function nativeDetector() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new window.BarcodeDetector({ formats }) : null;
  } catch { return null; }
}
async function startNative(detector, video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia(CAMERA);
  const release = () => stream.getTracks().forEach((t) => t.stop());
  try {
    video.srcObject = stream; video.muted = true;
    video.setAttribute('playsinline', '');
    await video.play();
  } catch (err) { release(); throw err; }
  let stopped = false, busy = false;
  const timer = setInterval(async () => {
    if (stopped || busy || video.readyState < 2) return;
    busy = true;
    try {
      const found = await detector.detect(video);
      if (!stopped && found.length) onCode(found[0].rawValue);
    } catch {} finally { busy = false; }
  }, 200);
  return { engine: 'native', stop() {
    stopped = true; clearInterval(timer); release(); video.srcObject = null;
  } };
}
async function startZxing(video, onCode) {
  let mod;
  try { mod = await import('@zxing/browser'); }
  catch { throw scanError('SCANNER_LOAD'); }
  video.muted = true;
  video.setAttribute('playsinline', '');
  const reader = new mod.BrowserMultiFormatReader();
  const controls = await reader.decodeFromConstraints(CAMERA, video, (result) => {
    if (result) onCode(result.getText());
  });
  return { engine: 'zxing', stop: () => controls.stop() };
}
export async function startScanner(video, onCode) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)
    throw scanError('NO_CAMERA_API');
  const detector = await nativeDetector();
  if (detector) return startNative(detector, video, onCode);
  return startZxing(video, onCode);
}
