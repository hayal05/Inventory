import { Link } from 'react-router-dom';
import Badge from './Badge.jsx';
import Card from './Card.jsx';
import EmptyState from './EmptyState.jsx';
import Skeleton from './Skeleton.jsx';
import { expiryLabel, expiryVariant } from '../lib/expiry.js';
import './ExpiringPanel.css';

const qtyFmt = new Intl.NumberFormat('en');

// items: rows from GET /api/reports/expiring (soonest first); null while loading.
// total: how many batches match in all, so the footer can say "View all".
export default function ExpiringPanel({ items, total, days = 30 }) {
  return (
    <Card
      title="Expiring soon"
      subtitle={`Batches expiring within ${days} days, or already expired`}
      className="expiring"
    >
      {!items ? (
        <div className="expiring__skeletons">
          <Skeleton height="2.4rem" />
          <Skeleton height="2.4rem" />
          <Skeleton height="2.4rem" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState compact icon="check" title={`Nothing expiring in the next ${days} days`} />
      ) : (
        <ul className="expiring__list">
          {items.map((it) => (
            <li className="expiring__item" key={`${it.batchId}-${it.locationId}`}>
              <div className="expiring__main">
                <p className="expiring__name">{it.name}</p>
                <p className="expiring__meta">
                  Batch {it.batchNo} &middot; {qtyFmt.format(it.qty)} {it.baseUnit} &middot; {it.locationName}
                </p>
              </div>
              <Badge variant={expiryVariant(it.daysLeft)} title={it.expiryDate}>
                {expiryLabel(it.daysLeft)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {items && total > items.length && (
        <Link className="expiring__more" to="/expiry">
          View all {total}
        </Link>
      )}
    </Card>
  );
}
