import './Badge.css';

// Small pill for trends and status.
// variant: 'up' (green), 'down' (red), 'warn' (amber), 'neutral' (default).
export default function Badge({ variant = 'neutral', className = '', children, ...rest }) {
  const cls = ['badge', `badge--${variant}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}

// Trend badge from a percentage change: null shows a dash, positive is green up, negative is red down.
// `invert` flips the colours for figures where up is bad (low stock, expiring soon); the arrow still shows the direction.
export function TrendBadge({ value, invert = false, ...rest }) {
  if (value === null || value === undefined) return <Badge {...rest}>&ndash;</Badge>;
  const good = invert ? value < 0 : value > 0;
  const bad = invert ? value > 0 : value < 0;
  const variant = good ? 'up' : bad ? 'down' : 'neutral';
  const arrow = value > 0 ? '▲ ' : value < 0 ? '▼ ' : '';
  return (
    <Badge variant={variant} {...rest}>
      {arrow}
      {Math.abs(value).toFixed(1)}%
    </Badge>
  );
}
