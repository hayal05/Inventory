import { useEffect, useState } from 'react';
import Button from './Button.jsx';
import PickList from './PickList.jsx';
import ProductPicker from './ProductPicker.jsx';
import { useToast } from './Toast.jsx';
import { api } from '../api.js';
import { planForProduct } from '../lib/fefo.js';
import { EMPTY_ISSUE, buildIssuePayload, checkIssue, describeIssue, parseQty } from '../lib/issueForm.js';
import './ReceiveForm.css';

const intFmt = new Intl.NumberFormat('en');
const SHOWN = new Set(['productId', 'qty', 'note']);
const todayUtc = () => new Date().toISOString().slice(0, 10);
export default function IssueForm({ initialProduct = null, onIssued }) {
  const toast = useToast();
  const [product, setProduct] = useState(initialProduct);
  const [form, setForm] = useState(EMPTY_ISSUE);
  const [stock, setStock] = useState(undefined);
  const [stockError, setStockError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!product) return undefined;
    const controller = new AbortController();
    setStock(undefined); setStockError('');
    api.get('/stock', { productId: product.id, includeBatches: product.trackBatches ? 'true' : undefined, limit: 100 },
      { signal: controller.signal })
      .then((d) => setStock(d.items[0] ?? null))
      .catch((err) => err.name !== 'AbortError' && setStockError(err.message));
    return () => controller.abort();
  }, [product?.id, product?.trackBatches, reloadKey]);
  const qty = parseQty(form.qty);
  const plan = product && stock !== undefined ? planForProduct(product, stock, qty ?? 1, todayUtc()) : null;
  const preview = qty !== null && plan && plan.shortfall === 0 ? plan.picks : null;
  function chooseProduct(p) {
    setProduct(p); setErrors({}); setFormError(''); setStock(undefined);
  }
  async function handleSubmit(e) {
    e.preventDefault(); setFormError(''); setDone(null);
    const problems = checkIssue(form, product, qty !== null && plan ? plan : null);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      const result = await api.post('/stock/issue', buildIssuePayload(form, product, stock?.locationId));
      const message = describeIssue(result, product);
      setDone({ message, picks: result.picks, baseUnit: product.baseUnit });
      toast.success(message);
      const issued = result.picks.reduce((s, p) => s + p.qty, 0);
      setProduct((p) => ({ ...p, onHand: (p.onHand ?? 0) - issued }));
      setForm(EMPTY_ISSUE);
      setReloadKey((n) => n + 1);
      onIssued?.(result);
    } catch (err) {
      const fields = err.fields || {};
      setErrors(fields);
      const hidden = Object.entries(fields).filter(([k]) => !SHOWN.has(k));
      setFormError(Object.keys(fields).length === 0 ? err.message : hidden.map(([, m]) => m).join(' '));
      if (err.code === 'INSUFFICIENT_STOCK') setReloadKey((n) => n + 1);
    } finally { setBusy(false); }
  }
  return (
    <form className="rform" onSubmit={handleSubmit} noValidate>
      {done && <div className="rform__result" role="status">
        <p className="rform__success">{done.message}</p>
        <PickList picks={done.picks} baseUnit={done.baseUnit} label="Taken from, in this order:" />
      </div>}
      {formError && <p className="rform__alert" role="alert">{formError}</p>}
      {stockError && <p className="rform__alert" role="alert">Could not load stock: {stockError}</p>}
      <div className="rform__field">
        <span>Product *</span>
        <ProductPicker value={product} onChange={chooseProduct} error={errors.productId}
          autoFocus={!initialProduct} disabled={busy} />
      </div>
      {product && stock !== undefined && <p className="rform__hint rform__hint--plain">
        {intFmt.format(plan.available)} {product.baseUnit} available to issue
        {plan.expiredQty > 0 && ` (${intFmt.format(plan.expiredQty)} more on hand ${plan.expiredQty === 1 ? 'is' : 'are'} expired and will not be used)`}.
      </p>}
      <label className="rform__field">
        <span>Quantity{product ? ` (${product.baseUnit})` : ''} *</span>
        <input value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
          inputMode="numeric" placeholder="0" aria-invalid={Boolean(errors.qty)} autoFocus={Boolean(initialProduct)} />
        {errors.qty && <em className="rform__error">{errors.qty}</em>}
      </label>
      {product?.trackBatches && preview &&
        <PickList picks={preview} baseUnit={product.baseUnit} label="Will be taken from (earliest expiry first):" />}
      <label className="rform__field">
        <span>Note</span>
        <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          maxLength={500} placeholder="Customer, invoice number, …" aria-invalid={Boolean(errors.note)} />
        {errors.note && <em className="rform__error">{errors.note}</em>}
      </label>
      <div className="rform__actions">
        <Button type="submit" disabled={busy || (product && stock === undefined && !stockError)}>
          {busy ? 'Issuing…' : 'Issue stock'}
        </Button>
      </div>
    </form>
  );
}
