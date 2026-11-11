// Form <-> API mapping for the product drawer. Kept free of React so it can be tested alone.
// Form values are all strings (plus the trackBatches boolean), as typed in the inputs.

export const EMPTY_FORM = {
  sku: '',
  name: '',
  barcode: '',
  category: '',
  baseUnit: 'pcs',
  costPrice: '',
  sellPrice: '',
  reorderLevel: '0',
  trackBatches: false,
  imageUrl: '',
  imagePublicId: '',
};

// A product from the API -> form values.
export function formFromProduct(p) {
  return {
    sku: p.sku,
    name: p.name,
    barcode: p.barcode ?? '',
    category: p.category ?? '',
    baseUnit: p.baseUnit,
    costPrice: p.costPrice ?? '',
    sellPrice: p.sellPrice ?? '',
    reorderLevel: String(p.reorderLevel ?? 0),
    trackBatches: Boolean(p.trackBatches),
    imageUrl: p.imageUrl ?? '',
    imagePublicId: p.imagePublicId ?? '',
  };
}

// Form values -> the values the API stores (blank optional fields become null).
function normalize(f) {
  const blank = (v) => (v.trim() === '' ? null : v.trim());
  return {
    sku: f.sku.trim(),
    name: f.name.trim(),
    barcode: blank(f.barcode),
    category: blank(f.category),
    baseUnit: f.baseUnit.trim(),
    costPrice: blank(f.costPrice),
    sellPrice: blank(f.sellPrice),
    reorderLevel: f.reorderLevel.trim() === '' ? 0 : Number(f.reorderLevel),
    trackBatches: f.trackBatches,
    imageUrl: blank(f.imageUrl),
    imagePublicId: blank(f.imagePublicId),
  };
}

// Quick checks before calling the server. The server validates again; this only saves a round trip
// for the obvious mistakes. Returns { field: message }.
export function checkForm(f) {
  const errors = {};
  if (!f.sku.trim()) errors.sku = 'Required';
  if (!f.name.trim()) errors.name = 'Required';
  if (!f.baseUnit.trim()) errors.baseUnit = 'Required';
  const level = f.reorderLevel.trim();
  if (level !== '' && !/^\d+$/.test(level)) errors.reorderLevel = 'Must be a whole number, 0 or more';
  return errors;
}

// Body for POST (everything) or PUT (only what changed, compared with `initial`, a form-values object).
// Returns null when editing and nothing changed.
export function buildPayload(form, initial = null) {
  const next = normalize(form);
  if (!initial) return next;
  const prev = normalize(initial);
  const changed = {};
  for (const key of Object.keys(next)) {
    if (next[key] !== prev[key]) changed[key] = next[key];
  }
  // The server wants the two image fields together (or both null to clear), so send both if either changed.
  if ('imageUrl' in changed || 'imagePublicId' in changed) {
    changed.imageUrl = next.imageUrl;
    changed.imagePublicId = next.imagePublicId;
  }
  return Object.keys(changed).length ? changed : null;
}
