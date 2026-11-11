export const EMPTY_FORM = {
  sku: '', name: '', barcode: '', category: '', baseUnit: 'pcs', costPrice: '', sellPrice: '',
  reorderLevel: '0', trackBatches: false, imageUrl: '', imagePublicId: '',
};
export function formFromProduct(p) {
  return {
    sku: p.sku, name: p.name, barcode: p.barcode ?? '', category: p.category ?? '',
    baseUnit: p.baseUnit, costPrice: p.costPrice ?? '', sellPrice: p.sellPrice ?? '',
    reorderLevel: String(p.reorderLevel ?? 0), trackBatches: Boolean(p.trackBatches),
    imageUrl: p.imageUrl ?? '', imagePublicId: p.imagePublicId ?? '',
  };
}
function normalize(f) {
  const blank = (v) => (v.trim() === '' ? null : v.trim());
  return {
    sku: f.sku.trim(), name: f.name.trim(), barcode: blank(f.barcode),
    category: blank(f.category), baseUnit: f.baseUnit.trim(),
    costPrice: blank(f.costPrice), sellPrice: blank(f.sellPrice),
    reorderLevel: f.reorderLevel.trim() === '' ? 0 : Number(f.reorderLevel),
    trackBatches: f.trackBatches, imageUrl: blank(f.imageUrl),
    imagePublicId: blank(f.imagePublicId),
  };
}
export function checkForm(f) {
  const errors = {};
  if (!f.sku.trim()) errors.sku = 'Required';
  if (!f.name.trim()) errors.name = 'Required';
  if (!f.baseUnit.trim()) errors.baseUnit = 'Required';
  const level = f.reorderLevel.trim();
  if (level !== '' && !/^\d+$/.test(level)) errors.reorderLevel = 'Must be a whole number, 0 or more';
  return errors;
}
export function buildPayload(form, initial = null) {
  const next = normalize(form);
  if (!initial) return next;
  const prev = normalize(initial);
  const changed = {};
  for (const key of Object.keys(next)) if (next[key] !== prev[key]) changed[key] = next[key];
  if ('imageUrl' in changed || 'imagePublicId' in changed) {
    changed.imageUrl = next.imageUrl;
    changed.imagePublicId = next.imagePublicId;
  }
  return Object.keys(changed).length ? changed : null;
}
