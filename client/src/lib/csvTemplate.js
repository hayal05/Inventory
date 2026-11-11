// Template offered by the import dialog. Columns match the server (docs/architecture.md).
export const MAX_CSV_BYTES = 1024 * 1024; // server limit: 1 MB

export const CSV_TEMPLATE =
  'sku,name,barcode,category,base_unit,cost_price,sell_price,reorder_level,track_batches\n' +
  'PARA-500,Paracetamol 500 mg,6001234567890,Pain relief,box,1.50,2.50,20,true\n';

// One line per problem, e.g. "sku: Required; reorderLevel: Cannot be negative".
export function describeErrors(errors) {
  return Object.entries(errors || {})
    .map(([field, message]) => `${field}: ${message}`)
    .join('; ');
}

export function checkCsvFile(file) {
  if (file.size === 0) return 'The file is empty.';
  if (file.size > MAX_CSV_BYTES) return 'The file is too large (max 1 MB, 1000 rows).';
  return '';
}
