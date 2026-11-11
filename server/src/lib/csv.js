// CSV parsing and product-row mapping for POST /api/products/import. No dependencies.
export function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;
  let wasQuoted = false;

  const endField = () => {
    record.push(field);
    field = '';
    wasQuoted = false;
  };
  const endRecord = () => {
    endField();
    if (!(record.length === 1 && record[0] === '')) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === '' && !wasQuoted) {
      inQuotes = true;
      wasQuoted = true;
    } else if (c === ',') endField();
    else if (c === '\n') endRecord();
    else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      endRecord();
    } else field += c;
  }
  if (inQuotes) throw new Error('Unterminated quoted field');
  if (field !== '' || record.length > 0 || wasQuoted) endRecord();
  return records;
}

export const COLUMNS = [
  'sku','name','barcode','category','base_unit','cost_price','sell_price','reorder_level','track_batches',
];
export const REQUIRED_COLUMNS = ['sku', 'name'];
const FIELD = {
  sku: 'sku', name: 'name', barcode: 'barcode', category: 'category',
  base_unit: 'baseUnit', cost_price: 'costPrice', sell_price: 'sellPrice',
  reorder_level: 'reorderLevel', track_batches: 'trackBatches',
};
export function readHeader(record) {
  const index = {};
  const ignored = [];
  const problems = [];
  record.forEach((raw, pos) => {
    const name = raw.trim().toLowerCase();
    if (!name) return;
    if (!COLUMNS.includes(name)) return ignored.push(raw.trim());
    if (name in index) problems.push(`Column "${name}" appears more than once`);
    else index[name] = pos;
  });
  for (const col of REQUIRED_COLUMNS) if (!(col in index)) problems.push(`Missing required column "${col}"`);
  return { index, ignored, problems };
}
const TRUE = new Set(['true', 'yes', '1']);
const FALSE = new Set(['false', 'no', '0']);
export function recordToInput(record, index) {
  const out = {};
  for (const [col, pos] of Object.entries(index)) {
    const raw = (record[pos] ?? '').trim();
    if (raw === '') continue;
    const field = FIELD[col];
    if (field === 'reorderLevel') out[field] = /^\d+$/.test(raw) ? Number(raw) : raw;
    else if (field === 'trackBatches') {
      const v = raw.toLowerCase();
      out[field] = TRUE.has(v) ? true : FALSE.has(v) ? false : raw;
    } else out[field] = raw;
  }
  return out;
}
