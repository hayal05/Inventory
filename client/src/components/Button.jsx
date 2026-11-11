import './Button.css';

// variant: 'primary' (magenta) or 'ghost' (outlined). size: 'md' or 'sm'.
// Pass `href` to render a link styled as a button.
export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  href,
  className = '',
  children,
  ...rest
}) {
  const cls = ['btn', `btn--${variant}`, size === 'sm' ? 'btn--sm' : '', className]
    .filter(Boolean)
    .join(' ');
  if (href) {
    return (
      <a className={cls} href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} type={type} {...rest}>
      {children}
    </button>
  );
}
