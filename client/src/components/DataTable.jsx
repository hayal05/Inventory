import Skeleton from './Skeleton.jsx';
import './DataTable.css';

// Plain table with loading and empty states.
// columns: [{ key, header, render?(row), align?: 'right', className? }]; rows: array or null while loading.
// rowKey: field name or function giving a unique key. empty: node shown when rows is [].
// On narrow screens each row becomes a card (see DataTable.css); a cell shows its column header as a label
// when the header is plain text, and no label when the header is empty (e.g. an Edit button column).
export default function DataTable({ columns, rows, rowKey = 'id', empty = 'Nothing to show.', skeletonRows = 6 }) {
  const keyOf = typeof rowKey === 'function' ? rowKey : (r) => r[rowKey];
  return (
    <div className="dtable__wrap">
      <table className="dtable">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === 'right' ? 'is-right' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows
            ? rows.map((row) => (
                <tr key={keyOf(row)}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      data-label={typeof c.header === 'string' && c.header ? c.header : undefined}
                      className={[c.align === 'right' ? 'is-right' : '', c.className || ''].join(' ').trim() || undefined}
                    >
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            : Array.from({ length: skeletonRows }, (_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <Skeleton height="1rem" />
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {rows && rows.length === 0 && <div className="dtable__empty">{empty}</div>}
    </div>
  );
}
