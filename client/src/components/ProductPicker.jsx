import { useEffect, useRef, useState } from 'react';
import BarcodeScanner from './BarcodeScanner.jsx';
import Button from './Button.jsx';
import { api } from '../api.js';
import { pickScanMatch } from '../lib/barcode.js';
import './ProductPicker.css';

const intFmt = new Intl.NumberFormat('en');

// Pick one product by typing part of its name, SKU or barcode.
// Props: value (the chosen product, or null), onChange(product | null), error, autoFocus, disabled.
// Pressing Enter picks the only match, so a USB barcode scanner (digits, then Enter) works too.
// The Scan button reads a barcode with the phone camera (BarcodeScanner) and picks the product whose barcode
// or SKU is exactly that code; if it is not certain, the code goes into the search box for the user to choose.
export default function ProductPicker({ value, onChange, error, autoFocus = false, disabled = false }) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState(null); // { term, items }; null = not loaded for the current text yet
  const [searchError, setSearchError] = useState('');
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef(null);
  const term = input.trim();

  useEffect(() => {
    if (!term) {
      setResults(null);
      setSearchError('');
      return undefined;
    }
    const controller = new AbortController();
    setResults(null);
    setSearchError('');
    const t = setTimeout(() => {
      api
        .get('/products', { q: term, limit: 8 }, { signal: controller.signal })
        .then((data) => setResults({ term, items: data.items }))
        .catch((err) => err.name !== 'AbortError' && setSearchError(err.message));
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [term]);

  function choose(product) {
    setInput('');
    setResults(null);
    onChange(product);
  }

  // Enter picks the only match. A barcode scanner types the code and presses Enter within a few
  // milliseconds, before the debounced search has run, so look it up right away when needed.
  async function handleKeyDown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter must not submit the form while searching
    if (!term) return;
    let items = results?.term === term ? results.items : null;
    if (!items) {
      try {
        items = (await api.get('/products', { q: term, limit: 8 })).items;
      } catch (err) {
        return setSearchError(err.message);
      }
      setResults({ term, items });
    }
    if (items.length === 1) choose(items[0]);
  }

  async function handleScan(code) {
    setScanning(false);
    try {
      const { items } = await api.get('/products', { q: code, limit: 8 });
      const match = pickScanMatch(code, items);
      if (match) return choose(match);
      setInput(code); // the list then shows the search results (or "No products match") for the scanned code
    } catch (err) {
      setInput(code);
      setSearchError(err.message);
    }
  }

  if (value) {
    return (
      <div className="picker">
        <div className="picker__chosen">
          <div className="picker__text">
            <strong className="picker__name">{value.name}</strong>
            <span className="picker__meta">
              SKU {value.sku} · {intFmt.format(value.onHand ?? 0)} {value.baseUnit} on hand
              {value.trackBatches ? ' · tracks batches' : ''}
            </span>
          </div>
          {!disabled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              Change
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="picker">
      <div className="picker__row">
        <input
          ref={inputRef}
          className="picker__input"
          type="search"
          placeholder="Search by name, SKU or barcode"
          aria-label="Product"
          aria-invalid={Boolean(error)}
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {!disabled && (
          <Button variant="ghost" className="picker__scan" onClick={() => setScanning(true)}>
            Scan
          </Button>
        )}
      </div>
      <BarcodeScanner open={scanning} onDetect={handleScan} onClose={() => setScanning(false)} />
      {term && (
        <ul className="picker__list" aria-label="Matching products">
          {searchError ? (
            <li className="picker__note picker__note--error" role="alert">
              Could not search: {searchError}
            </li>
          ) : results?.term !== term ? (
            <li className="picker__note">Searching…</li>
          ) : results.items.length === 0 ? (
            <li className="picker__note">No products match “{term}”.</li>
          ) : (
            results.items.map((p) => (
              <li key={p.id}>
                <button type="button" className="picker__option" onClick={() => choose(p)}>
                  <span className="picker__name">{p.name}</span>
                  <span className="picker__meta">
                    SKU {p.sku} · {intFmt.format(p.onHand ?? 0)} {p.baseUnit}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {error && <em className="picker__error">{error}</em>}
    </div>
  );
}
