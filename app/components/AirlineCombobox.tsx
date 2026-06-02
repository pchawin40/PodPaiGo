'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AIRLINE_CATALOG,
  resolveAirlineInput,
  searchAirlines,
  type AirlineCatalogEntry,
} from '../../lib/airlines/airlineCatalog';

type AirlineComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  className?: string;
};

export default function AirlineCombobox({
  value,
  onChange,
  label = 'Airline or flight number (optional)',
  placeholder = 'Alaska, Delta, AS 123',
  helperText = 'Search airlines or enter a flight number. Free text is allowed.',
  className = '',
}: AirlineComboboxProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => searchAirlines(value), [value]);
  const resolved = useMemo(() => resolveAirlineInput(value), [value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selectSuggestion = (entry: AirlineCatalogEntry) => {
    onChange(entry.name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={className}>
      <label className="block text-sm font-medium text-zinc-800">
        {label}
        <div className="relative mt-2">
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                setOpen(true);
                return;
              }

              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }

              if (event.key === 'Enter' && open && suggestions[activeIndex]) {
                event.preventDefault();
                selectSuggestion(suggestions[activeIndex]);
              }

              if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />

          {open && suggestions.length > 0 ? (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-lg"
            >
              {suggestions.map((entry, index) => (
                <li key={entry.name} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(entry)}
                    className={
                      'flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-sky-50 ' +
                      (index === activeIndex ? 'bg-sky-50 text-sky-950' : 'text-slate-800')
                    }
                  >
                    <span>{entry.name}</span>
                    <span className="text-xs text-slate-500">{entry.carrierCodes.join(', ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </label>

      {helperText ? <p className="mt-2 text-xs text-zinc-500">{helperText}</p> : null}

      {resolved.carrierCode && resolved.airlineName ? (
        <p className="mt-2 text-xs text-slate-600">
          Detected: {resolved.airlineName}
          {resolved.flightNumber ? ` · flight ${resolved.carrierCode} ${resolved.flightNumber}` : ''}
        </p>
      ) : null}

      {value.trim() && !resolved.matchedCatalogEntry ? (
        <p className="mt-2 text-xs text-amber-800">
          Custom airline entry — confirm gate and check-in details with your airline before travel.
        </p>
      ) : null}
    </div>
  );
}

export { AIRLINE_CATALOG };
