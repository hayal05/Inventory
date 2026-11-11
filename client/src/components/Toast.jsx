import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import './Toast.css';

const ToastContext = createContext(null);
const MAX_VISIBLE = 4;
const DURATION = { success: 4000, info: 4000, error: 7000 };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(1);
  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);
  const show = useCallback((kind, message) => {
    if (!message) return undefined;
    const id = nextId.current++;
    setToasts((list) => [...list, { id, kind, message: String(message) }].slice(-MAX_VISIBLE));
    timers.current.set(id, setTimeout(() => dismiss(id), DURATION[kind]));
    return id;
  }, [dismiss]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);
  const api = useMemo(() => ({
    success: (message) => show('success', message),
    error: (message) => show('error', message),
    info: (message) => show('info', message),
    dismiss,
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <button key={t.id} type="button" className={`toast toast--${t.kind}`}
            role={t.kind === 'error' ? 'alert' : undefined} onClick={() => dismiss(t.id)} title="Dismiss">
            <span className="toast__message">{t.message}</span>
            <span className="toast__close" aria-hidden="true">&times;</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
