import { useEffect, useRef, useState } from 'react';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';
import { cleanCode, describeScanError, startScanner } from '../lib/barcode.js';
import './BarcodeScanner.css';

// Camera barcode scanner in a dialog. Opens the rear camera while `open`, calls onDetect(code) once with the
// first code it reads, and always releases the camera when it closes. The parent closes it (onClose) in
// response to onDetect. Props: open, onDetect(code), onClose.
export default function BarcodeScanner({ open, onDetect, onClose }) {
  const videoRef = useRef(null);
  const detectRef = useRef(onDetect);
  detectRef.current = onDetect;
  const [state, setState] = useState('starting'); // 'starting' | 'scanning' | 'error'
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0); // bump to try the camera again

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false; // set when the dialog closes (or React re-runs this effect) before the camera is ready
    let handled = false;
    let scanner = null;
    setState('starting');
    setMessage('');

    startScanner(videoRef.current, (raw) => {
      const code = cleanCode(raw);
      if (handled || cancelled || !code) return;
      handled = true;
      detectRef.current?.(code);
    })
      .then((s) => {
        if (cancelled) s.stop();
        else {
          scanner = s;
          setState('scanning');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState('error');
        setMessage(describeScanError(err));
      });

    return () => {
      cancelled = true;
      scanner?.stop();
    };
  }, [open, attempt]);

  return (
    <Dialog
      open={open}
      title="Scan barcode"
      onClose={onClose}
      footer={
        <>
          {state === 'error' && (
            <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="scanner">
        <div className="scanner__frame" hidden={state === 'error'}>
          <video ref={videoRef} className="scanner__video" playsInline muted aria-label="Camera view" />
          <span className="scanner__guide" aria-hidden="true" />
        </div>
        {state === 'error' ? (
          <p className="scanner__note scanner__note--error" role="alert">
            {message}
          </p>
        ) : (
          <p className="scanner__note" role="status">
            {state === 'starting' ? 'Starting the camera…' : 'Hold the barcode inside the frame.'}
          </p>
        )}
      </div>
    </Dialog>
  );
}
