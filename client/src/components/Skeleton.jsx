import './Skeleton.css';

// Grey shimmering placeholder shown while a panel loads.
// Props: width, height (any CSS size), className. Hidden from screen readers.
export default function Skeleton({ width = '100%', height = '1em', className = '', style, ...rest }) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...rest}
    />
  );
}
