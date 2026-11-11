import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Card from '../components/Card.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pager from '../components/Pager.jsx';
import Tabs from '../components/Tabs.jsx';
import TopBar from '../components/TopBar.jsx';
import { api } from '../api.js';
import { expiryLabel, expiryVariant } from '../lib/expiry.js';
import './Expiry.css';

const PAGE_SIZE = 20;
const WINDOWS = [30, 60, 90];
const TABS = WINDOWS.map((d) => ({ key: String(d), label: `${d} days` }));
const qtyFmt = new Intl.NumberFormat('en');

const columns = [
  {
    key: 'name',
    header: 'Product',
    render: (r) => (
      <Link className="expiry__name" to={`/products/${r.productId}`}>
        {r.name}
      </Link>
    ),
  },
  { key: 'batchNo', header: 'Batch', className: 'expiry__batch' },
  { key: 'locationName', header: 'Location' },
  { key: 'qty', header: 'Quantity', align: 'right', render: (r) => `${qtyFmt.format(r.qty)} ${r.baseUnit}` },
  { key: 'expiryDate', header: 'Expires' },
  {
    key: 'daysLeft',
    header: 'Status',
    render: (r) => <Badge variant={expiryVariant(r.daysLeft)}>{expiryLabel(r.daysLeft)}</Badge>,
  },
];

// Expiry screen at /expiry. Tabs for the 30, 60 and 90-day windows (`?days=60`). Each lists the batches that
// still have stock and expire within the window, plus batches already expired but still on hand, soonest first.
export default function Expiry() {
  const [params, setParams] = useSearchParams();
  const days = WINDOWS.includes(Number(params.get('days'))) ? Number(params.get('days')) : 30;
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null); // { items, total, totalPages, ... } or null while loading
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    api
      .get('/reports/expiring', { days, page, limit: PAGE_SIZE }, { signal: controller.signal })
      .then(setData)
      .catch((err) => err.name !== 'AbortError' && setError(err.message));
    return () => controller.abort();
  }, [days, page]);

  const subtitle =
    data && data.total > 0
      ? `${qtyFmt.format(data.total)} batch${data.total === 1 ? '' : 'es'} expiring within ${days} days or already expired`
      : ' ';

  return (
    <>
      <TopBar title="Expiry" subtitle={subtitle} />
      <Card padded={false}>
        <Tabs
          tabs={TABS}
          active={String(days)}
          onChange={(key) => {
            setPage(1);
            setParams(key === '30' ? {} : { days: key });
          }}
        />
        {error ? (
          <p className="expiry__error" role="alert">
            Could not load the expiry report: {error}
          </p>
        ) : (
          <DataTable
            columns={columns}
            rows={data?.items ?? null}
            rowKey={(r) => `${r.batchId}-${r.locationId}`}
            empty={
              <EmptyState icon="check" title={`Nothing expires within ${days} days`}>
                Only products that track batches and expiry dates appear here.
              </EmptyState>
            }
          />
        )}
        {data && <Pager page={data.page} totalPages={data.totalPages} onChange={setPage} />}
      </Card>
    </>
  );
}
