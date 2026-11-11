import { useEffect, useRef, useState } from 'react';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';
import { cleanCode, describeScanError, startScanner } from '../lib/barcode.js';
import './BarcodeScanner.css';

export default function BarcodeScanner({ open, onDetect, onClose }) {
  const videoRef = useRef(null);
  const detectRef = useRef(onDetect);
  detectRef.current = onDetect;
  const [state, setState] = useState('starting');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let handled = false;
    let scanner = null;
    setState('starting');
    setMessage('');
    startScanner(videoRef.current, (raw) => {
      const code = cleanCode(raw);
      if (handled || cancelled || !code) return;
      handled = true;
      detectRef.current?.(code);
    }).then((s) => {
      if (cancelled) s.stop();
      else { scanner = s; setState('scanning'); }
    }).catch((err) => {
      if (cancelled) return;
      setState('error');
      setMessage(describeScanError(err));
    });
    return () => { cancelled = true; scanner?.stop(); };
  }, [open, attempt]);

  return (
    <Dialog open={open} title="Scan barcode" onClose={onClose} footer={
      <>
        {state === 'error' && <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>
    }>
      <div className="scanner">
        <div className="scanner__frame" hidden={state === 'error'}>
          <video ref={videoRef} className="scanner__video" playsInline muted aria-label="Camera view" />
          <span className="scanner__guide" aria-hidden="true" />
        </div>
        {state === 'error' ? <p className="scanner__note scanner__note--error" role="alert">{message}</p> :
          <p className="scanner__note" role="status">
            {state === 'starting' ? 'Starting the camera…' : 'Hold the barcode inside the frame.'}
          </p>}
      </div>
    </Dialog>
  );
}
