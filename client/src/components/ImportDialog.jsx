import { useState } from 'react';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';
import { request } from '../api.js';
import { CSV_TEMPLATE, checkCsvFile, describeErrors } from '../lib/csvTemplate.js';
import './ImportDialog.css';

// Import products from a CSV in two steps: preview (nothing saved), then confirm.
// onClose closes; onImported(count) runs once rows were saved (the page reloads its list).
export default function ImportDialog({ onClose, onImported }) {
  const [step, setStep] = useState('pick'); // pick | working | preview | done
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const send = (commit) =>
    request('/products/import', {
      method: 'POST',
      query: { commit: commit ? 'true' : undefined },
      headers: { 'Content-Type': 'text/csv' },
      rawBody: csv,
    });

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = checkCsvFile(file);
    if (problem) return setError(problem);
    setError('');
    setStep('working');
    try {
      const text = await file.text();
      setCsv(text);
      setFileName(file.name);
      const data = await request('/products/import', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, rawBody: text });
      setResult(data);
      setStep('preview');
    } catch (err) {
      setError(err.message);
      setStep('pick');
    }
  }

  async function handleConfirm() {
    setError('');
    setStep('working');
    try {
      const data = await send(true);
      setResult(data);
      setStep('done');
      onImported?.(data.imported);
    } catch (err) {
      setError(err.message);
      setStep('preview');
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const working = step === 'working';
  let footer;
  if (step === 'preview') {
    footer = (
      <>
        <Button variant="ghost" onClick={() => { setResult(null); setStep('pick'); }}>
          Choose another file
        </Button>
        <Button onClick={handleConfirm} disabled={result.validRows === 0}>
          {result.validRows === 0 ? 'Nothing to import' : `Import ${result.validRows} product${result.validRows === 1 ? '' : 's'}`}
        </Button>
      </>
    );
  } else if (step === 'done') {
    footer = <Button onClick={onClose}>Done</Button>;
  } else {
    footer = (
      <Button variant="ghost" onClick={onClose} disabled={working}>
        Cancel
      </Button>
    );
  }

  return (
    <Dialog open title="Import products from CSV" wide={step === 'preview' || step === 'done'} onClose={working ? undefined : onClose} footer={footer}>
      {error && (
        <p className="import__alert" role="alert">
          {error}
        </p>
      )}

      {(step === 'pick' || working) && (
        <div className="import__pick">
          <p>
            Choose a CSV file (max 1 MB, 1000 rows). Only <strong>sku</strong> and <strong>name</strong> are required. You will see a preview before
            anything is saved.
          </p>
          <div className="import__actions">
            <label className={`btn btn--primary${working ? ' is-disabled' : ''}`}>
              {working ? 'Checking file…' : 'Choose CSV file'}
              <input type="file" accept=".csv,text/csv" hidden disabled={working} onChange={handleFile} />
            </label>
            <Button variant="ghost" onClick={downloadTemplate} disabled={working}>
              Download template
            </Button>
          </div>
        </div>
      )}

      {(step === 'preview' || step === 'done') && result && (
        <>
          <p className="import__summary">
            <strong>{fileName}</strong>:{' '}
            {step === 'done' ? (
              <>
                imported <strong>{result.imported}</strong> product{result.imported === 1 ? '' : 's'}
                {result.invalidRows > 0 && <>, skipped {result.invalidRows} with problems</>}.
              </>
            ) : (
              <>
                {result.totalRows} row{result.totalRows === 1 ? '' : 's'}, <strong>{result.validRows} ready to import</strong>
                {result.invalidRows > 0 && <>, <span className="import__bad">{result.invalidRows} with problems (will be skipped)</span></>}.
              </>
            )}
          </p>
          {result.ignoredColumns?.length > 0 && <p className="import__note">Ignored columns: {result.ignoredColumns.join(', ')}</p>}

          {result.errors.length > 0 && (
            <>
              <h3 className="import__heading">Problems</h3>
              <div className="import__scroll">
                <table className="import__table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>SKU</th>
                      <th>Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={`${e.row}-${i}`}>
                        <td>{e.row}</td>
                        <td>{e.sku || '–'}</td>
                        <td>{describeErrors(e.errors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.errorsTruncated && <p className="import__note">Only the first {result.errors.length} problems are shown.</p>}
            </>
          )}

          {step === 'preview' && result.preview?.length > 0 && (
            <>
              <h3 className="import__heading">First {result.preview.length} valid rows</h3>
              <div className="import__scroll">
                <table className="import__table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>SKU</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Unit</th>
                      <th>Reorder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((r) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        <td>{r.sku}</td>
                        <td>{r.name}</td>
                        <td>{r.category || '–'}</td>
                        <td>{r.baseUnit}</td>
                        <td>{r.reorderLevel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
