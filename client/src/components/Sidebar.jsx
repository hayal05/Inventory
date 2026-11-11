import { useEffect, useRef } from 'react';
import './Sidebar.css';

export const NAV_GROUPS = [
  {
    label: 'Menu',
    items: [
      { key: 'dashboard', label: 'Dashboard', href: '/' },
      { key: 'products', label: 'Products', href: '/products' },
      { key: 'stock', label: 'Stock', href: '/stock' },
      { key: 'expiry', label: 'Expiry', href: '/expiry' },
      { key: 'partners', label: 'Partners', href: '/partners' },
      { key: 'reports', label: 'Reports', href: '/reports' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { key: 'users', label: 'Users', href: '/users' },
      { key: 'settings', label: 'Settings', href: '/settings' },
    ],
  },
];

export default function Sidebar({
  activeKey,
  user,
  onSearch,
  onNavigate,
  onLogout,
  groups = NAV_GROUPS,
  brand = 'Inventory',
}) {
  const activeRef = useRef(null);
  useEffect(() => {
    if (window.matchMedia?.('(max-width: 768px)').matches) {
      activeRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
    }
  }, [activeKey]);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true" />
        <span className="sidebar__brand-name">{brand}</span>
      </div>
      <input
        className="sidebar__search"
        type="search"
        placeholder="Search"
        aria-label="Search"
        onChange={(e) => onSearch?.(e.target.value)}
      />
      <nav className="sidebar__nav" aria-label="Main">
        {groups.map((group) => (
          <div className="sidebar__group" key={group.label}>
            <p className="sidebar__group-label">{group.label}</p>
            {group.items.map((item) => (
              <a
                key={item.key}
                ref={item.key === activeKey ? activeRef : undefined}
                href={item.href}
                className={`sidebar__link${item.key === activeKey ? ' is-active' : ''}`}
                aria-current={item.key === activeKey ? 'page' : undefined}
                onClick={(e) => onNavigate?.(item, e)}
              >
                {item.label}
              </a>
            ))}
          </div>
        ))}
        {onLogout && (
          <button type="button" className="sidebar__link sidebar__logout-mobile" onClick={onLogout}>
            Log out
          </button>
        )}
      </nav>
      {user && (
        <div className="sidebar__account">
          <span className="sidebar__avatar" aria-hidden="true">
            {(user.email || '?')[0].toUpperCase()}
          </span>
          <div className="sidebar__account-text">
            <p className="sidebar__email">{user.email}</p>
            {user.role && <p className="sidebar__role">{user.role}</p>}
          </div>
          {onLogout && (
            <button type="button" className="sidebar__logout" onClick={onLogout}>Log out</button>
          )}
        </div>
      )}
    </aside>
  );
}
