import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from './Card.jsx';
import EmptyState from './EmptyState.jsx';
import Skeleton from './Skeleton.jsx';
import './MovementsChart.css';

const MAGENTA = '#d63cff';
const GRID = '#1b2a5a';
const MUTED = '#9aa6c7';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayShort = (d) => String(Number(d.slice(8, 10)));
export const dayLong = (d) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { date, movements } = payload[0].payload;
  return (
    <div className="mvchart__tooltip">
      <p className="mvchart__tooltip-title">{dayLong(date)}</p>
      <p>{movements} movement{movements === 1 ? '' : 's'}</p>
    </div>
  );
}

export default function MovementsChart({ items }) {
  const empty = items && items.every((i) => i.movements === 0);
  return (
    <Card title="Movements per day" subtitle="Last 14 days" className="mvchart">
      {!items ? <Skeleton height="200px" /> : empty ? (
        <div className="mvchart__placeholder">
          <EmptyState compact icon="chart" title="No stock movements yet" />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={items} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" tickFormatter={dayShort} stroke={MUTED} tickLine={false} axisLine={{ stroke: GRID }} fontSize={12} interval="preserveStartEnd" />
            <YAxis stroke={MUTED} tickLine={false} axisLine={false} fontSize={12} width={32} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar dataKey="movements" fill={MAGENTA} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
