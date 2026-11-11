import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdjustDialog from '../components/AdjustDialog.jsx';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import MovementHistory from '../components/MovementHistory.jsx';
import ProductDrawer from '../components/ProductDrawer.jsx';
import Skeleton from '../components/Skeleton.jsx';
import StockByLocation from '../components/StockByLocation.jsx';
import Tabs from '../components/Tabs.jsx';
import TopBar from '../components/TopBar.jsx';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { optimizedUrl } from '../lib/cloudinary.js';
import './ProductDetail.css';

const intFmt = new Intl.NumberFormat('en');
const money = (v) => (v == null ? '–' :
  new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v)));
const TABS = [{ key: 'stock', label: 'Stock' }, { key: 'history', label: 'Movement history' }];
export default function ProductDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canEdit = user?.role === 'owner' || user?.role === 'staff';
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('stock');
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    api.get(`/products/${id}`, undefined, { signal: controller.signal })
      .then(setProduct).catch((err) => err.name !== 'AbortError' && setError(err));
    return () => controller.abort();
  }, [id, reload]);
  if (error) return <>
    <TopBar title={error.status === 404 ? 'Product not found' : 'Could not load the product'}
      subtitle={error.status === 404 ? 'It may have been deleted.' : error.message} />
    <Link to="/products">&larr; Back to products</Link>
  </>;
  const low = product && product.reorderLevel > 0 && product.onHand <= product.reorderLevel;
  return (
    <>
      <p className="pd__back"><Link to="/products">&larr; Products</Link></p>
      <TopBar title={product ? product.name : 'Loading…'} subtitle={product ? `SKU ${product.sku}` : ' '}
        onExport={canEdit && product ? () => navigate(`/stock?productId=${product.id}`) : undefined}
        exportLabel="Receive stock" onCreate={canEdit && product ? () => setEditing(true) : undefined}
        createLabel="Edit product" />
      <Card className="pd__summary" actions={canEdit && product ?
        <Button variant="ghost" size="sm" onClick={() => setAdjusting(true)}>Adjust stock</Button> : undefined}>
        {product ? (
          <div className="pd__grid">
            {product.imageUrl ?
              <img className="pd__image" src={optimizedUrl(product.imageUrl)} alt={product.name} /> :
              <div className="pd__image pd__image--empty">No image</div>}
            <dl className="pd__facts">
              <div><dt>On hand</dt><dd>{intFmt.format(product.onHand)} {product.baseUnit}
                {low && <Badge variant="down">Low</Badge>}</dd></div>
              <div><dt>Reorder level</dt><dd>{product.reorderLevel > 0 ?
                intFmt.format(product.reorderLevel) : 'Not set'}</dd></div>
              <div><dt>Cost price</dt><dd>{money(product.costPrice)}</dd></div>
              <div><dt>Sell price</dt><dd>{money(product.sellPrice)}</dd></div>
              <div><dt>Category</dt><dd>{product.category || '–'}</dd></div>
              <div><dt>Barcode</dt><dd>{product.barcode || '–'}</dd></div>
              <div><dt>Batches and expiry</dt><dd>{product.trackBatches ? 'Tracked' : 'Not tracked'}</dd></div>
            </dl>
          </div>
        ) : <Skeleton height="120px" />}
      </Card>
      <Card padded={false} className="pd__tabs">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {product && tab === 'stock' && <StockByLocation productId={product.id} baseUnit={product.baseUnit}
          trackBatches={product.trackBatches} refreshKey={reload} />}
        {product && tab === 'history' && <MovementHistory productId={product.id}
          baseUnit={product.baseUnit} refreshKey={reload} />}
      </Card>
      {adjusting && <AdjustDialog product={product} onClose={() => setAdjusting(false)} onSaved={(message) => {
        setAdjusting(false); toast.success(message); setReload((n) => n + 1);
      }} />}
      {editing && <ProductDrawer product={product} onClose={() => setEditing(false)} onSaved={(saved) => {
        toast.success(`Saved changes to ${saved?.name ?? product.name}.`);
        setEditing(false); setReload((n) => n + 1);
      }} />}
    </>
  );
}
