import { useEffect, useState } from 'react';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';
import Skeleton from './Skeleton.jsx';
import { api } from '../api.js';
import { EMPTY_ADJUST, REASONS, buildAdjustPayload, checkAdjust, describeAdjust } from '../lib/adjustForm.js';
import './AdjustDialog.css';

const intFmt = new Intl.NumberFormat('en');
const SHOWN = new Set(['qtyDelta', 'batchId', 'reason', 'note']);
export default function AdjustDialog({ product, onClose, onSaved }) {
  const [stock, setStock] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_ADJUST);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api.get('/stock', {
      productId: product.id, includeBatches: product.trackBatches ? 'true' : undefined,
      includeZero: 'true', limit: 100,
    }, { signal: controller.signal })
      .then((d) => setStock(d.items[0] ?? {}))
      .catch((err) => err.name !== 'AbortError' && setLoadError(err.message));
    return () => controller.abort();
  }, [product.id, product.trackBatches]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const batch = stock?.batches?.find((b) => b.batchId === form.batchId);
  const onHand = product.trackBatches ? (batch?.qty ?? 0) : (stock?.qty ?? 0);
  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    const problems = checkAdjust(form, { trackBatches: product.trackBatches, onHand });
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      const result = await api.post('/stock/adjust', buildAdjustPayload(form, {
        productId: product.id, trackBatches: product.trackBatches, locationId: stock?.locationId,
      }));
      onSaved(describeAdjust(result, product));
    } catch (err) {
      const fields = err.fields || {};
      setErrors({ ...fields, qty: fields.qtyDelta });
      const hidden = Object.entries(fields).filter(([k]) => !SHOWN.has(k));
      setFormError(Object.keys(fields).length === 0 ? err.message : hidden.map(([, m]) => m).join(' '));
      setBusy(false);
    }
  }
  const loading = !stock && !loadError;
  return (
    <Dialog open title={`Adjust stock: ${product.name}`} onClose={busy ? undefined : onClose} footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" form="adjust-form" disabled={busy || loading || Boolean(loadError)}>
          {busy ? 'Saving…' : 'Save adjustment'}
        </Button>
      </>
    }>
      {loadError ? <p className="adj__alert" role="alert">Could not load stock: {loadError}</p> :
        loading ? <Skeleton height="200px" /> :
        <form id="adjust-form" className="adj" onSubmit={handleSubmit} noValidate>
          {formError && <p className="adj__alert" role="alert">{formError}</p>}
          <p className="adj__hint">Use this to correct the count (damage, loss, a stock take). To record delivered goods, use Receive stock instead.</p>
          {product.trackBatches && <label className="adj__field">
            <span>Batch *</span>
            <select value={form.batchId} onChange={set('batchId')} aria-invalid={Boolean(errors.batchId)}>
              <option value="">{stock.batches?.length ? 'Choose a batch…' : 'No batches yet'}</option>
              {(stock.batches ?? []).map((b) => <option key={b.batchId} value={b.batchId}>
                {b.batchNo} · expires {b.expiryDate ?? 'n/a'} · {intFmt.format(b.qty)} on hand
              </option>)}
            </select>
            {errors.batchId && <em className="adj__error">{errors.batchId}</em>}
          </label>}
          <div className="adj__row">
            <label className="adj__field"><span>Change</span>
              <select value={form.direction} onChange={set('direction')}>
                <option value="remove">Remove stock</option><option value="add">Add stock</option>
              </select>
            </label>
            <label className="adj__field"><span>Quantity ({product.baseUnit}) *</span>
              <input value={form.qty} onChange={set('qty')} inputMode="numeric" placeholder="0"
                aria-invalid={Boolean(errors.qty)} autoFocus />
              {errors.qty && <em className="adj__error">{errors.qty}</em>}
            </label>
          </div>
          {(!product.trackBatches || batch) && <p className="adj__hint">
            Currently {intFmt.format(onHand)} {product.baseUnit} on hand{batch ? ` in batch ${batch.batchNo}` : ''}.
          </p>}
          <label className="adj__field"><span>Reason *</span>
            <input value={form.reason} onChange={set('reason')} list="adjust-reasons" maxLength={200}
              aria-invalid={Boolean(errors.reason)} placeholder="Pick or type a reason" />
            <datalist id="adjust-reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist>
            {errors.reason && <em className="adj__error">{errors.reason}</em>}
          </label>
          <label className="adj__field"><span>Note</span>
            <input value={form.note} onChange={set('note')} maxLength={500} aria-invalid={Boolean(errors.note)} />
            {errors.note && <em className="adj__error">{errors.note}</em>}
          </label>
        </form>}
    </Dialog>
  );
}
