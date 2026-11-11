import Badge from './Badge.jsx';
import { daysUntil, expiryLabel, expiryVariant } from '../lib/expiry.js';
import './PickList.css';

const intFmt = new Intl.NumberFormat('en');

// Which batches a FEFO issue draws from, in order. picks: [{ batchId, batchNo, expiryDate, qty }].
// A pick with no batch (product without batch tracking) is shown as "Unbatched stock".
export default function PickList({ picks, baseUnit, label }) {
  if (!picks?.length) return null;
  return (
    <div className="picks">
      <p className="picks__label">{label}</p>
      <ul className="picks__list">
        {picks.map((p) => (
          <li key={p.batchId ?? 'none'} className="picks__item">
            <span className="picks__batch">{p.batchNo ? `Batch ${p.batchNo}` : 'Unbatched stock'}</span>
            {p.expiryDate && (
              <Badge variant={expiryVariant(daysUntil(p.expiryDate))} title={p.expiryDate}>
                {expiryLabel(daysUntil(p.expiryDate))}
              </Badge>
            )}
            <span className="picks__qty">
              {intFmt.format(p.qty)} {baseUnit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
