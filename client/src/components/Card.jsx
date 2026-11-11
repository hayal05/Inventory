import './Card.css';

// Surface panel used by KPI cards, charts and side panels.
// Props: title, subtitle, actions (right side of header), padded (default true), className.
export default function Card({
  title,
  subtitle,
  actions,
  padded = true,
  className = '',
  children,
  ...rest
}) {
  const hasHeader = title || subtitle || actions;
  const cls = ['card', padded ? 'card--padded' : '', className].filter(Boolean).join(' ');
  return (
    <section className={cls} {...rest}>
      {hasHeader && (
        <header className="card__header">
          <div className="card__heading">
            {title && <h2 className="card__title">{title}</h2>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
