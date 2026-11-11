import Button from './Button.jsx';
import './TopBar.css';

// Page header: welcome heading, short subtitle, ghost Export and magenta Create buttons.
// Props: title, subtitle, onExport, onCreate, exportLabel, createLabel.
// A button is hidden when its handler is not given, so pages without export/create can reuse the bar.
export default function TopBar({
  title = 'Welcome back',
  subtitle,
  onExport,
  onCreate,
  exportLabel = 'Export',
  createLabel = 'Create',
}) {
  return (
    <header className="topbar">
      <div className="topbar__text">
        <h1 className="topbar__title">{title}</h1>
        {subtitle && <p className="topbar__subtitle">{subtitle}</p>}
      </div>
      {(onExport || onCreate) && (
        <div className="topbar__actions">
          {onExport && (
            <Button variant="ghost" onClick={onExport}>
              {exportLabel}
            </Button>
          )}
          {onCreate && <Button onClick={onCreate}>{createLabel}</Button>}
        </div>
      )}
    </header>
  );
}
