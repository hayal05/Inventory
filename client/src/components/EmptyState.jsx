import './EmptyState.css';

// Simple line icons (24x24 grid), chosen with the `icon` prop.
const ICONS = {
  box: <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Zm0 0 9 4.5m0 0 9-4.5M12 12v9" />,
  search: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5" />,
  check: <path d="M5 12.5 10 17.5 19 7" />,
  chart: <path d="M4 20V10m6 10V4m6 16v-7m5 7H3" />,
};

// What a screen shows when there is nothing to list yet. Say what is empty and, when there is something to do
// about it, offer that as `action` (a Button or two).
// Props: title (required), children (one short sentence of help), action (node), icon ('box' | 'search' | 'check' | 'chart'),
// compact (smaller, for panels and charts).
export default function EmptyState({ title, children, action, icon = 'box', compact = false }) {
  return (
    <div className={`empty${compact ? ' empty--compact' : ''}`}>
      <svg className="empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[icon] ?? ICONS.box}
      </svg>
      <p className="empty__title">{title}</p>
      {children && <p className="empty__text">{children}</p>}
      {action && <div className="empty__actions">{action}</div>}
    </div>
  );
}
