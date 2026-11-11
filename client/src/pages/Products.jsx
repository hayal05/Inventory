import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Card from '../components/Card.jsx';
import DataTable from '../components/DataTable.jsx';
import ImportDialog from '../components/ImportDialog.jsx';
import ProductDrawer from '../components/ProductDrawer.jsx';
import TopBar from '../components/TopBar.jsx';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { optimizedUrl } from '../lib/cloudinary.js';
import './Products.css';

const PAGE_SIZE = 20;
const intFmt = new Intl.NumberFormat('en');
const moneyFmt = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isLow = (p) => p.reorderLevel > 0 && p.onHand <= p.reorderLevel;

const baseColumns = [
  { key: 'sku', header: 'SKU', className: 'products__sku' },
  { key: 'name', header: 'Name', render: (p) => <span className="products__namecell">
    {p.imageUrl ? <img className="products__thumb" src={optimizedUrl(p.imageUrl, 'f_auto,q_auto,w_80,h_80,c_fill')} alt="" loading="lazy" /> :
      <span className="products__thumb products__thumb--empty" aria-hidden="true" />}
    <Link className="products__name" to={`/products/${p.id}`}>{p.name}</Link>
  </span> },
  { key: 'category', header: 'Category', render: (p) => p.category || '–' },
  { key: 'onHand', header: 'On hand', align: 'right', render: (p) =>
    <span className="products__qty">{isLow(p) && <Badge variant="down">Low</Badge>}
      {intFmt.format(p.onHand)} {p.baseUnit}</span> },
  { key: 'reorderLevel', header: 'Reorder at', align: 'right', render: (p) => p.reorderLevel > 0 ? intFmt.format(p.reorderLevel) : '–' },
  { key: 'sellPrice', header: 'Price', align: 'right', render: (p) => p.sellPrice == null ? '–' : moneyFmt.format(Number(p.sellPrice)) },
];

export default function Products() {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user?.role === 'owner' || user?.role === 'staff';
  const [drawer, setDrawer] = useState(null);
  const [reload, setReload] = useState(0);
  const [importing, setImporting] = useState(false);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);
  useEffect(() => {
    const ctl = new AbortController();
    setData(null); setError('');
    api.get('/products', { q, lowStock: lowStock || undefined, page, limit: PAGE_SIZE }, { signal: ctl.signal })
      .then(setData).catch((err) => err.name !== 'AbortError' && setError(err.message));
    return () => ctl.abort();
  }, [q, lowStock, page, reload]);

  const filtered = Boolean(q) || lowStock;
  const columns = canEdit ? [...baseColumns,
    { key: 'actions', header: '', align: 'right', render: (p) =>
      <Button variant="ghost" size="sm" onClick={() => setDrawer(p)}>Edit</Button> }] : baseColumns;

  return <>
    <TopBar title="Products" subtitle={data ? `${intFmt.format(data.total)} product${data.total === 1 ? '' : 's'}` : ' '}
      onCreate={canEdit ? () => setDrawer('new') : undefined} createLabel="Add product" />
    <Card padded={false}>
      <div className="products__toolbar">
        <input className="products__search" type="search" placeholder="Search by name, SKU or barcode"
          aria-label="Search products" value={input} onChange={(e) => setInput(e.target.value)} />
        <Button variant={lowStock ? 'primary' : 'ghost'} size="sm" aria-pressed={lowStock}
          onClick={() => { setLowStock((v) => !v); setPage(1); }}>Low stock only</Button>
        {canEdit && <Button variant="ghost" size="sm" onClick={() => setImporting(true)}>Import CSV</Button>}
      </div>
      {error ? <p className="products__error" role="alert">Could not load products: {error}</p> :
        <DataTable columns={columns} rows={data?.items ?? null} empty={filtered ?
          <EmptyState icon="search" title="No products match"
            action={<Button variant="ghost" size="sm" onClick={() => { setInput(''); setLowStock(false); setPage(1); }}>Clear search and filters</Button>}>
            {q ? `Nothing found for “${q}”. ` : ''}Check the spelling, or try a SKU or barcode.
          </EmptyState> :
          <EmptyState title="No products yet" action={canEdit && <>
            <Button onClick={() => setDrawer('new')}>Add product</Button>
            <Button variant="ghost" onClick={() => setImporting(true)}>Import CSV</Button>
          </>}>
            {canEdit ? 'Add your first product, or import many at once from a CSV file.' :
              'Ask an owner or staff member to add the first products.'}
          </EmptyState>} />}
      {data && data.totalPages > 1 && <div className="products__pager">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <span>Page {data.page} of {data.totalPages}</span>
        <Button variant="ghost" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>}
    </Card>
    {importing && <ImportDialog onClose={() => setImporting(false)} onImported={(count) => {
      toast.success(`Imported ${count} product${count === 1 ? '' : 's'}.`);
      setPage(1); setReload((n) => n + 1);
    }} />}
    {drawer && <ProductDrawer product={drawer === 'new' ? null : drawer} onClose={() => setDrawer(null)}
      onSaved={(saved) => {
        toast.success(drawer === 'new' ? `Added ${saved?.name ?? 'product'}.` :
          `Saved changes to ${saved?.name ?? 'product'}.`);
        setDrawer(null); setReload((n) => n + 1);
      }} />}
  </>;
}
