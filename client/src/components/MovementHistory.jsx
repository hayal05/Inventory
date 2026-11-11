import { useEffect, useState } from 'react';
import Badge from './Badge.jsx';
import Button from './Button.jsx';
import DataTable from './DataTable.jsx';
import EmptyState from './EmptyState.jsx';
import { api } from '../api.js';
import { MOVEMENT_TYPES, deltaVariant, formatDelta, typeLabel } from '../lib/movements.js';
import './MovementHistory.css';

const PAGE_SIZE = 20;
export default function MovementHistory({ productId, baseUnit, refreshKey }) {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    api.get(`/products/${productId}/movements`, { type, page, limit: PAGE_SIZE }, { signal: controller.signal })
      .then(setData).catch((err) => err.name !== 'AbortError' && setError(err.message));
    return () => controller.abort();
  }, [productId, type, page, refreshKey]);
  const columns = [
    { key: 'createdAt', header: 'When', render: (m) => <span className="mh__when">{new Date(m.createdAt).toLocaleString()}</span> },
    { key: 'type', header: 'Type', render: (m) => typeLabel(m.type) },
    { key: 'qtyDelta', header: 'Change', align: 'right', render: (m) =>
      <Badge variant={deltaVariant(m.qtyDelta)}>{formatDelta(m.qtyDelta)} {baseUnit}</Badge> },
    { key: 'location', header: 'Location', render: (m) => m.location.name },
    { key: 'batch', header: 'Batch', render: (m) => (m.batch ? m.batch.batchNo : '–') },
    { key: 'note', header: 'Reason / note', render: (m) => [m.reason, m.note].filter(Boolean).join(': ') || '–' },
    { key: 'user', header: 'By', render: (m) => <span className="mh__user">{m.user}</span> },
  ];
  return (
    <div>
      <div className="mh__toolbar">
        <label><span className="mh__label">Type</span>
          <select className="mh__select" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All movements</option>
            {MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
      </div>
      {error ? <p className="mh__error" role="alert">Could not load the history: {error}</p> :
        <DataTable columns={columns} rows={data?.items ?? null} empty={
          type ? <EmptyState compact icon="search" title="No movements of this type">
            Choose another type to see the rest of the history.
          </EmptyState> : <EmptyState compact icon="chart" title="No stock movements yet">
            Receiving, issuing or adjusting this product will show up here.
          </EmptyState>
        } />}
      {data && data.totalPages > 1 && <div className="mh__pager">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <span>Page {data.page} of {data.totalPages}</span>
        <Button variant="ghost" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>}
    </div>
  );
}
