import { useEffect, useState } from 'react';
import Badge from './Badge.jsx';
import DataTable from './DataTable.jsx';
import EmptyState from './EmptyState.jsx';
import { api } from '../api.js';
import { expiryLabel, expiryVariant } from '../lib/expiry.js';
import './StockByLocation.css';

const qtyFmt = new Intl.NumberFormat('en');

export default function StockByLocation({ productId, baseUnit, trackBatches, refreshKey }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setError('');
    api.get('/stock', { productId, includeBatches: trackBatches ? 'true' : undefined, limit: 100 }, { signal: controller.signal })
      .then((d) => setRows(d.items))
      .catch((err) => err.name !== 'AbortError' && setError(err.message));
    return () => controller.abort();
  }, [productId, trackBatches, refreshKey]);

  if (error) return <p className="sbl__error" role="alert">Could not load stock: {error}</p>;

  const columns = [
    { key: 'locationName', header: 'Location' },
    { key: 'qty', header: 'On hand', align: 'right', render: (r) => `${qtyFmt.format(r.qty)} ${baseUnit}` },
  ];
  if (trackBatches) columns.push({
    key: 'batches', header: 'Batches (earliest expiry first)',
    render: (r) => r.batches?.length ? (
      <ul className="sbl__batches">
        {r.batches.map((b) => (
          <li key={b.batchId ?? b.id ?? b.batchNo}>
            <span>{b.batchNo}: {qtyFmt.format(b.qty)}</span>
            {b.expiryDate && <ExpiryBadge date={b.expiryDate} />}
          </li>
        ))}
      </ul>
    ) : '–',
  });

  return <DataTable columns={columns} rows={rows} rowKey="locationId" empty={
    <EmptyState compact title="No stock on hand">Receive stock for this product to see it here.</EmptyState>
  } skeletonRows={2} />;
}

function ExpiryBadge({ date }) {
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return <Badge variant={expiryVariant(days)} title={date}>{expiryLabel(days)}</Badge>;
}
