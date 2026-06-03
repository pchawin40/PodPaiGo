'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AIRPORT_DIRECTORY_FEATURE_LABELS,
  AIRPORT_DIRECTORY_STATUS_LABELS,
  filterAirportDirectory,
  getAvailableCountries,
  getAvailableRegions,
  type AirportDirectoryRecord,
  type AirportDirectoryStatus,
} from '../../lib/airports/airportDirectory';
import EmptyState from './ui/EmptyState';
import StatusPill from './ui/StatusPill';
import TravelCard from './ui/TravelCard';

type AirportsDirectoryProps = {
  airports: AirportDirectoryRecord[];
};

type FilterChipProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

function FilterChip({ active, label, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition ' +
        (active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-card text-muted-foreground hover:border-primary/20 hover:bg-muted hover:text-foreground')
      }
    >
      {label}
    </button>
  );
}

function statusTone(status: AirportDirectoryStatus): 'primary' | 'accent' | 'muted' {
  if (status === 'active_planner') return 'primary';
  if (status === 'planning_guide') return 'accent';
  return 'muted';
}

export default function AirportsDirectory({ airports }: AirportsDirectoryProps) {
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState<'all' | string>('all');
  const [region, setRegion] = useState<'all' | string>('all');
  const [status, setStatus] = useState<'all' | AirportDirectoryStatus>('all');

  const regions = useMemo(() => getAvailableRegions(airports), [airports]);
  const countries = useMemo(() => getAvailableCountries(airports), [airports]);

  const filtered = useMemo(
    () =>
      filterAirportDirectory(airports, {
        query,
        country,
        region,
        status,
      }),
    [airports, query, country, region, status],
  );

  return (
    <div className="mt-8 space-y-6">
      <TravelCard padding="sm" className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-foreground">Search airports</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by code, city, state/province, or country"
            className="mt-2 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/15"
          />
        </label>

        <div className="space-y-3">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Country
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={country === 'all'} label="All" onClick={() => setCountry('all')} />
              {countries.includes('US') ? (
                <FilterChip
                  active={country === 'US'}
                  label="United States"
                  onClick={() => setCountry('US')}
                />
              ) : null}
              {countries.includes('CA') ? (
                <FilterChip
                  active={country === 'CA'}
                  label="Canada"
                  onClick={() => setCountry('CA')}
                />
              ) : null}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              State / Province
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={region === 'all'} label="All" onClick={() => setRegion('all')} />
              {regions.map((value) => (
                <FilterChip
                  key={value}
                  active={region === value}
                  label={value}
                  onClick={() => setRegion(value)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Status
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={status === 'all'} label="All" onClick={() => setStatus('all')} />
              <FilterChip
                active={status === 'active_planner'}
                label="Active airport planner"
                onClick={() => setStatus('active_planner')}
              />
              <FilterChip
                active={status === 'planning_guide'}
                label="Airport planning guide"
                onClick={() => setStatus('planning_guide')}
              />
              <FilterChip
                active={status === 'coming_soon'}
                label="Coming soon"
                onClick={() => setStatus('coming_soon')}
              />
            </div>
          </div>
        </div>
      </TravelCard>

      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {airports.length} airports
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title="No airports found"
          description="Try searching by city, airport code, or state/province."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((airport) => (
            <Link key={airport.code} href={`/airports/${airport.slug}`} className="group block">
              <TravelCard className="h-full transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <StatusPill tone="primary" className="text-sm">
                      {airport.code}
                    </StatusPill>

                    <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground group-hover:text-primary">
                      {airport.name}
                    </h2>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {[airport.city, airport.region, airport.country].filter(Boolean).join(', ')}
                    </p>
                  </div>

                  <StatusPill tone={statusTone(airport.status)} className="shrink-0">
                    {AIRPORT_DIRECTORY_STATUS_LABELS[airport.status]}
                  </StatusPill>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {airport.features.map((feature) => (
                    <StatusPill key={feature} tone="muted">
                      {AIRPORT_DIRECTORY_FEATURE_LABELS[feature]}
                    </StatusPill>
                  ))}
                </div>

                {airport.notes ? (
                  <p className="mt-4 text-sm leading-6 text-muted-foreground">{airport.notes}</p>
                ) : null}

                <div className="mt-6 text-sm font-semibold text-primary">View airport planner →</div>
              </TravelCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
