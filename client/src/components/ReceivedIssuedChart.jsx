import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from './Card.jsx';
import EmptyState from './EmptyState.jsx';
import Skeleton from './Skeleton.jsx';
import './ReceivedIssuedChart.css';

const CYAN = '#22c3ff';
const MAGENTA = '#d63cff';
const GRID = '#1b2a5a';
const MUTED = '#9aa6c7';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${MONTHS[0]} ${String(y).slice(2)}` : MONTHS[m - 1];
}
const numFmt = new Intl.NumberFormat('en');
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="richart__tooltip">
      <p className="richart__tooltip-title">{label}</p>
      {payload.map((p) => <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {numFmt.format(p.value)}</p>)}
    </div>
  );
}
export default function ReceivedIssuedChart({ items }) {
  const data = (items || []).map((i) => ({ ...i, label: monthLabel(i.month) }));
  const empty = items && items.every((i) => i.received === 0 && i.issued === 0);
  return (
    <Card title="Stock received vs sold" subtitle="Units per month" className="richart">
      {!items ? <Skeleton height="280px" /> : empty ? (
        <div className="richart__placeholder">
          <EmptyState compact icon="chart" title="No stock movements yet">
            Receive or issue stock to see activity here.
          </EmptyState>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradReceived" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CYAN} stopOpacity={0.45} />
                <stop offset="100%" stopColor={CYAN} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradIssued" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MAGENTA} stopOpacity={0.45} />
                <stop offset="100%" stopColor={MAGENTA} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke={MUTED} tickLine={false} axisLine={false} fontSize={12} />
            <YAxis stroke={MUTED} tickLine={false} axisLine={false} fontSize={12} width={44} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID }} />
            <Area type="monotone" dataKey="received" name="Received" stroke={CYAN} strokeWidth={2} fill="url(#gradReceived)" />
            <Area type="monotone" dataKey="issued" name="Sold" stroke={MAGENTA} strokeWidth={2} fill="url(#gradIssued)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
