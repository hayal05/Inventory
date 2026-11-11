// Labels and colours for ledger movement types (see docs/architecture.md).
export const MOVEMENT_TYPES = [
  { value: 'receive', label: 'Received' },
  { value: 'issue', label: 'Issued' },
  { value: 'adjust', label: 'Adjusted' },
  { value: 'return', label: 'Returned' },
  { value: 'expire', label: 'Expired' },
];

export const typeLabel = (type) => MOVEMENT_TYPES.find((t) => t.value === type)?.label ?? type;

// Stock coming in is green, going out is red; the sign of the quantity decides for adjustments.
export function deltaVariant(qtyDelta) {
  return qtyDelta > 0 ? 'up' : qtyDelta < 0 ? 'down' : 'neutral';
}

export const formatDelta = (qtyDelta) => `${qtyDelta > 0 ? '+' : ''}${new Intl.NumberFormat('en').format(qtyDelta)}`;
