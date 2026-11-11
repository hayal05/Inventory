import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import Button from './components/Button.jsx';
import Card from './components/Card.jsx';
import EmptyState from './components/EmptyState.jsx';
import WakeNotice from './components/WakeNotice.jsx';
import TopBar from './components/TopBar.jsx';
import { RequireAuth } from './auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Expiry from './pages/Expiry.jsx';
import Login from './pages/Login.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Products from './pages/Products.jsx';
import Stock from './pages/Stock.jsx';

function Placeholder({ title }) {
  return (
    <>
      <TopBar title={title} />
      <Card>
        <EmptyState icon="chart" title="Coming soon">
          This screen has not been built yet.
        </EmptyState>
      </Card>
    </>
  );
}

function NotFound() {
  return (
    <>
      <TopBar title="Page not found" />
      <Card>
        <EmptyState
          icon="search"
          title="We could not find that page"
          action={
            <Button href="/" variant="ghost">
              Go to the dashboard
            </Button>
          }
        >
          The address may be wrong, or the page may have moved.
        </EmptyState>
      </Card>
    </>
  );
}

export default function App() {
  return (
    <>
    <WakeNotice />
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequireAuth />}>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="stock" element={<Stock />} />
        <Route path="expiry" element={<Expiry />} />
        <Route path="partners" element={<Placeholder title="Partners" />} />
        <Route path="reports" element={<Placeholder title="Reports" />} />
        <Route path="users" element={<Placeholder title="Users" />} />
        <Route path="settings" element={<Placeholder title="Settings" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      </Route>
    </Routes>
    </>
  );
}
