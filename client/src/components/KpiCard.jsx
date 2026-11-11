import Card from './Card.jsx';
import Skeleton from './Skeleton.jsx';
import { TrendBadge } from './Badge.jsx';
import './KpiCard.css';

// One headline number with its % change.
// Props: label, value (already formatted, or null while loading), changePct, invert (up is bad), note (small line below).
export default function KpiCard({ label, value, changePct, invert = false, note }) {
  return (
    <Card className="kpi">
      <p className="kpi__label">{label}</p>
      <div className="kpi__row">
        {value == null ? (
          <Skeleton width="96px" height="1.9rem" />
        ) : (
          <>
            <p className="kpi__value">{value}</p>
            <TrendBadge value={changePct} invert={invert} />
          </>
        )}
      </div>
      {note && <p className="kpi__note">{note}</p>}
    </Card>
  );
}
