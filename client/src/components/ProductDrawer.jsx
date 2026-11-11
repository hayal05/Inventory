import { useState } from 'react';
import Button from './Button.jsx';
import Drawer from './Drawer.jsx';
import { api } from '../api.js';
import { checkImageFile, optimizedUrl, uploadProductImage } from '../lib/cloudinary.js';
import { EMPTY_FORM, buildPayload, checkForm, formFromProduct } from '../lib/productForm.js';
import './ProductDrawer.css';

// Add (product = null) or edit (product = a row from GET /api/products) a product, with an optional image
// uploaded straight to Cloudinary.
// onSaved(product) runs after a successful save; onClose closes the drawer.
export default function ProductDrawer({ product, onClose, onSaved }) {
  const editing = Boolean(product);
  const [initial] = useState(() => (product ? formFromProduct(product) : EMPTY_FORM));
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again
    if (!file) return;
    const problem = checkImageFile(file);
    if (problem) return setImageError(problem);
    setImageError('');
    setUploading(true);
    try {
      const { imageUrl, imagePublicId } = await uploadProductImage(file);
      setForm((f) => ({ ...f, imageUrl, imagePublicId }));
    } catch (err) {
      setImageError(err.code === 'UNAVAILABLE' || err.status === 503 ? 'Image uploads are not set up yet.' : err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    const problems = checkForm(form);
    setErrors(problems);
    if (Object.keys(problems).length) return;

    const payload = buildPayload(form, editing ? initial : null);
    if (!payload) return onClose(); // nothing changed

    setBusy(true);
    try {
      const saved = editing ? await api.put(`/products/${product.id}`, payload) : await api.post('/products', payload);
      onSaved(saved);
    } catch (err) {
      setErrors(err.fields || {});
      // Field errors show under the fields; anything else (or no field info) shows at the top.
      setFormError(Object.keys(err.fields || {}).length ? '' : err.message);
      setBusy(false);
    }
  }

  const field = (key, label, props = {}) => (
    <label className="pform__field">
      <span>{label}</span>
      <input value={form[key]} onChange={set(key)} aria-invalid={Boolean(errors[key])} {...props} />
      {errors[key] && <em className="pform__error">{errors[key]}</em>}
    </label>
  );

  return (
    <Drawer
      open
      title={editing ? 'Edit product' : 'Add product'}
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" disabled={busy || uploading}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}
          </Button>
        </>
      }
    >
      <form id="product-form" className="pform" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="pform__alert" role="alert">
            {formError}
          </p>
        )}
        <div className="pform__image">
          {form.imageUrl ? (
            <img className="pform__preview" src={optimizedUrl(form.imageUrl)} alt="Product" />
          ) : (
            <div className="pform__preview pform__preview--empty">No image</div>
          )}
          <div className="pform__image-actions">
            <label className={`btn btn--ghost btn--sm${uploading ? ' is-disabled' : ''}`}>
              {uploading ? 'Uploading…' : form.imageUrl ? 'Replace image' : 'Choose image'}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={handleFile} />
            </label>
            {form.imageUrl && !uploading && (
              <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, imageUrl: '', imagePublicId: '' }))}>
                Remove
              </Button>
            )}
          </div>
          {imageError && <em className="pform__error">{imageError}</em>}
          {errors.imageUrl && <em className="pform__error">{errors.imageUrl}</em>}
          {errors.imagePublicId && <em className="pform__error">{errors.imagePublicId}</em>}
        </div>
        {field('sku', 'SKU *', { autoFocus: !editing, maxLength: 64 })}
        {field('name', 'Name *', { maxLength: 200 })}
        <div className="pform__row">
          {field('category', 'Category', { maxLength: 100 })}
          {field('baseUnit', 'Unit *', { maxLength: 20 })}
        </div>
        {field('barcode', 'Barcode', { maxLength: 64, inputMode: 'numeric' })}
        <div className="pform__row">
          {field('costPrice', 'Cost price', { inputMode: 'decimal', placeholder: '0.00' })}
          {field('sellPrice', 'Sell price', { inputMode: 'decimal', placeholder: '0.00' })}
        </div>
        {field('reorderLevel', 'Reorder level', { inputMode: 'numeric' })}
        <p className="pform__hint">Low-stock alerts start when stock falls to this number. 0 means no alert.</p>
        <label className="pform__check">
          <input type="checkbox" checked={form.trackBatches} onChange={set('trackBatches')} />
          <span>Track batches and expiry dates</span>
        </label>
        {editing && (
          <p className="pform__hint">Changing batch tracking on a product that already has stock can make its batch counts inconsistent.</p>
        )}
      </form>
    </Drawer>
  );
}
