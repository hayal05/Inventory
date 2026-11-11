import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar, { NAV_GROUPS } from './Sidebar.jsx';
import { useAuth } from '../auth.jsx';
import './AppLayout.css';

// Which nav item is active for the current URL ('/' is the dashboard).
function activeKeyFor(pathname) {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return item.key;
      }
    }
  }
  return undefined;
}

// Sidebar plus the page area. Pages render into <Outlet />.
export default function AppLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  function handleNavigate(item, event) {
    // Let the browser handle modified clicks (new tab); otherwise navigate without a page reload.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(item.href);
  }

  return (
    <div className="layout">
      <Sidebar
        activeKey={activeKeyFor(pathname)}
        user={user}
        onNavigate={handleNavigate}
        onLogout={logout}
      />
      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  );
}
