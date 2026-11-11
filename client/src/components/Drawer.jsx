import { useEffect, useRef } from 'react';
import './Drawer.css';

// Slide-in panel from the right. Closes on Escape or a click on the dark backdrop.
// Props: open, title, onClose, footer (buttons, pinned to the bottom), children.
export default function Drawer({ open, title, onClose, footer, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement;
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer__backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panelRef}>
        <header className="drawer__header">
          <h2 className="drawer__title">{title}</h2>
          <button type="button" className="drawer__close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__footer">{footer}</footer>}
      </aside>
    </div>
  );
}
