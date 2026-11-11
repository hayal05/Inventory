// CSV parsing and product-row mapping for POST /api/products/import. No dependencies.

// Minimal RFC 4180 parser: quoted fields, "" escapes, commas and newlines inside quotes,
// CRLF or LF line ends, optional UTF-8 BOM. Returns an array of records (arrays of strings).
// Fully blank lines are dropped. Throws Error on an unterminated quote.
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
    // a blank line parses as a single empty field
    if (!(record.length === 1 && record[0] === '' )) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
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
  'sku',
  'name',
  'barcode',
  'category',
  'base_unit',
  'cost_price',
  'sell_price',
  'reorder_level',
  'track_batches',
];
export const REQUIRED_COLUMNS = ['sku', 'name'];

// CSV column -> field name used by the product schema.
const FIELD = {
  sku: 'sku',
  name: 'name',
  barcode: 'barcode',
  category: 'category',
  base_unit: 'baseUnit',
  cost_price: 'costPrice',
  sell_price: 'sellPrice',
  reorder_level: 'reorderLevel',
  track_batches: 'trackBatches',
};

// Reads the header record. Names are case-insensitive and trimmed.
// Returns { index: {column: position}, ignored: [unknown header names] }, or throws a
// message string list via { problems } when the header is unusable.
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
  for (const col of REQUIRED_COLUMNS) {
    if (!(col in index)) problems.push(`Missing required column "${col}"`);
  }
  return { index, ignored, problems };
}

const TRUE = new Set(['true', 'yes', '1']);
const FALSE = new Set(['false', 'no', '0']);

// Turns one CSV record into the object the product schema expects. Blank cells become
// undefined so schema defaults apply (pcs, 0, false). Values that cannot be converted are
// passed through unchanged so the schema reports its normal error message.
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
