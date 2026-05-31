'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type AirportOption = {
  id: string;
  label: string;
  destinationName?: string;
  state?: string;
  geoLocation?: { lat: number; lng: number };
};

type AirportSearchPickerProps = {
  value: string;
  onChange: (airportCode: string, airport?: AirportOption) => void;
  className?: string;
};

function formatAirportLabel(airport: AirportOption): string {
  const state = airport.state ? `, ${airport.state}` : '';
  return `${airport.id} — ${airport.label}${state}`;
}

export default function AirportSearchPicker({
  value,
  onChange,
  className,
}: AirportSearchPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AirportOption[]>([]);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const trimmedQuery = query.trim();
  const showingPopular = open && !trimmedQuery;

  useEffect(() => {
    let active = true;

    async function resolveSelectedLabel() {
      if (!value) {
        setSelectedLabel('');
        return;
      }

      try {
        const res = await fetch(`/api/airports?code=${encodeURIComponent(value)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.airport) {
          setSelectedLabel(formatAirportLabel(data.airport));
        }
      } catch {
        if (active) setSelectedLabel(value);
      }
    }

    resolveSelectedLabel();
    return () => {
      active = false;
    };
  }, [value]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/airports/search?q=${encodeURIComponent(trimmedQuery)}&limit=15`,
        );
        const data = await res.json();
        if (active && Array.isArray(data.airports)) {
          setResults(data.airports);
        }
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, trimmedQuery ? 120 : 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const displayValue = useMemo(() => {
    if (open) return query;
    return selectedLabel || value;
  }, [open, query, selectedLabel, value]);

  return (
    <div ref={containerRef} className={className}>
      <label className="block text-sm font-medium text-zinc-800">Airport</label>
      <input
        type="text"
        value={displayValue}
        placeholder="Search by airport code, city, or airport name"
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        autoComplete="off"
        spellCheck={false}
      />
      <p className="mt-1 text-xs text-zinc-500">
        Search by airport code, city, or airport name. Popular U.S. airports appear when the field is empty.
      </p>

      {open && (
        <div className="relative z-20">
          <ul className="absolute mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-lg">
            {showingPopular && !loading && (
              <li className="px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Popular U.S. airports
              </li>
            )}

            {loading && (
              <li className="px-4 py-2 text-sm text-slate-500">Searching airports...</li>
            )}

            {!loading && results.length === 0 && (
              <li className="px-4 py-2 text-sm text-slate-500">No airports found.</li>
            )}

            {!loading &&
              results.map((airport) => (
                <li key={airport.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-sky-50"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(airport.id, airport);
                      setSelectedLabel(formatAirportLabel(airport));
                      setQuery('');
                      setOpen(false);
                    }}
                  >
                    <span className="text-sm font-medium text-slate-900">
                      {formatAirportLabel(airport)}
                    </span>
                    {airport.destinationName && airport.destinationName !== airport.label && (
                      <span className="text-xs text-slate-500">{airport.destinationName}</span>
                    )}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
