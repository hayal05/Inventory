import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../components/Card.jsx';
import IssueForm from '../components/IssueForm.jsx';
import ReceiveForm from '../components/ReceiveForm.jsx';
import Skeleton from '../components/Skeleton.jsx';
import Tabs from '../components/Tabs.jsx';
import TopBar from '../components/TopBar.jsx';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import './Stock.css';

const TABS = [
  { key: 'receive', label: 'Receive' },
  { key: 'issue', label: 'Issue' },
];

// Stock screen at /stock with a Receive tab and an Issue tab (`?tab=issue`). Adjusting stock is a dialog on the
// product page (task 55). `?productId=` pre-selects a product (the product page links here).
export default function Stock() {
  const { user } = useAuth();
  const canEdit = user?.role === 'owner' || user?.role === 'staff';
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'issue' ? 'issue' : 'receive';
  const productId = params.get('productId');

  const [initial, setInitial] = useState(null);
  const [ready, setReady] = useState(!productId); // false while the pre-selected product loads
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!productId) return undefined;
    const controller = new AbortController();
    setReady(false);
    setLoadError('');
    api
      .get(`/products/${productId}`, undefined, { signal: controller.signal })
      .then((p) => {
        setInitial(p);
        setReady(true);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // A missing product just means no pre-selection; show the empty form with a note.
        setLoadError(err.status === 404 ? 'That product was not found. Choose one below.' : `Could not load the product: ${err.message}`);
        setReady(true);
      });
    return () => controller.abort();
  }, [productId]);

  return (
    <>
      <TopBar title="Stock" subtitle={tab === 'issue' ? 'Sell or use stock from the main store' : 'Add delivered goods to the main store'} />
      <Card padded={false}>
        <Tabs
          tabs={TABS}
          active={tab}
          onChange={(key) =>
            setParams((prev) => {
              const next = new URLSearchParams(prev);
              if (key === 'issue') next.set('tab', 'issue');
              else next.delete('tab');
              return next;
            })
          }
        />
        <div className="stock__panel">
        {!canEdit ? (
          <p role="status">Your role can view stock but not change it. Ask an owner for staff access to receive or issue stock.</p>
        ) : !ready ? (
          <Skeleton height="220px" />
        ) : (
          <>
            {loadError && <p role="alert">{loadError}</p>}
            {tab === 'issue' ? (
              <IssueForm key={`i${initial?.id ?? 'none'}`} initialProduct={initial} />
            ) : (
              <ReceiveForm key={`r${initial?.id ?? 'none'}`} initialProduct={initial} />
            )}
          </>
        )}
        </div>
      </Card>
    </>
  );
}
