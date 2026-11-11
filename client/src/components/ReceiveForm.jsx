import { useState } from 'react';
import Button from './Button.jsx';
import ProductPicker from './ProductPicker.jsx';
import { useToast } from './Toast.jsx';
import { api } from '../api.js';
import { EMPTY_RECEIVE, buildReceivePayload, checkReceive, describeReceipt, isRealDate, todayUtc } from '../lib/receiveForm.js';
import './ReceiveForm.css';

const SHOWN = new Set(['productId', 'qty', 'unitCost', 'batchNo', 'expiryDate', 'note']);
export default function ReceiveForm({ initialProduct = null, onReceived }) {
  const toast = useToast();
  const [product, setProduct] = useState(initialProduct);
  const [form, setForm] = useState(() => ({ ...EMPTY_RECEIVE, unitCost: initialProduct?.costPrice ?? '' }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  function chooseProduct(p) {
    setProduct(p); setErrors({}); setFormError('');
    setForm({ ...EMPTY_RECEIVE, qty: form.qty, note: form.note, unitCost: p?.costPrice ?? '' });
  }
  async function handleSubmit(e) {
    e.preventDefault(); setFormError(''); setSuccess('');
    const problems = checkReceive(form, product);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      const result = await api.post('/stock/receive', buildReceivePayload(form, product));
      const message = describeReceipt(result, product);
      setSuccess(message); toast.success(message);
      setProduct((p) => ({ ...p, onHand: (p.onHand ?? 0) + result.movement.qtyDelta }));
      setForm({ ...EMPTY_RECEIVE, unitCost: product.costPrice ?? '' });
      onReceived?.(result);
    } catch (err) {
      const fields = err.fields || {};
      setErrors(fields);
      const hidden = Object.entries(fields).filter(([k]) => !SHOWN.has(k));
      setFormError(Object.keys(fields).length === 0 ? err.message : hidden.map(([, m]) => m).join(' '));
    } finally { setBusy(false); }
  }
  const field = (key, label, props = {}) => (
    <label className="rform__field">
      <span>{label}</span>
      <input value={form[key]} onChange={set(key)} aria-invalid={Boolean(errors[key])} {...props} />
      {errors[key] && <em className="rform__error">{errors[key]}</em>}
    </label>
  );
  const expired = product?.trackBatches && isRealDate(form.expiryDate) && form.expiryDate < todayUtc();
  return (
    <form className="rform" onSubmit={handleSubmit} noValidate>
      {success && <p className="rform__success" role="status">{success}</p>}
      {formError && <p className="rform__alert" role="alert">{formError}</p>}
      <div className="rform__field">
        <span>Product *</span>
        <ProductPicker value={product} onChange={chooseProduct}
          error={errors.productId} autoFocus={!initialProduct} disabled={busy} />
      </div>
      <div className="rform__row">
        {field('qty', `Quantity${product ? ` (${product.baseUnit})` : ''} *`, {
          inputMode: 'numeric', placeholder: '0', autoFocus: Boolean(initialProduct),
        })}
        {field('unitCost', 'Unit cost', { inputMode: 'decimal', placeholder: '0.00' })}
      </div>
      {product?.trackBatches && <>
        <div className="rform__row">
          {field('batchNo', 'Batch number *', { maxLength: 64 })}
          {field('expiryDate', 'Expiry date *', { type: 'date' })}
        </div>
        {expired ?
          <p className="rform__hint rform__hint--warn">This date has already passed. The stock will be treated as expired and skipped when issuing.</p> :
          <p className="rform__hint">Receiving the same batch number again adds to that batch; it must have the same expiry date.</p>}
      </>}
      {field('note', 'Note', { maxLength: 500, placeholder: 'Supplier, invoice number, …' })}
      <div className="rform__actions">
        <Button type="submit" disabled={busy}>{busy ? 'Receiving…' : 'Receive stock'}</Button>
      </div>
    </form>
  );
}
