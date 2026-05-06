'use client';

import { FlightStatusResult } from '../../lib/flights/types';
import { getMockFlightStatus } from '../../lib/flights/mockFlightStatus';

function statusClass(status: FlightStatusResult['status']): string {
  switch (status) {
    case 'boarding':
      return 'bg-blue-50 text-blue-800 ring-blue-200';
    case 'delayed':
      return 'bg-amber-50 text-amber-900 ring-amber-200';
    case 'cancelled':
      return 'bg-red-50 text-red-800 ring-red-200';
    case 'departed':
    case 'arrived':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
    case 'scheduled':
      return 'bg-zinc-50 text-zinc-800 ring-zinc-200';
    default:
      return 'bg-zinc-50 text-zinc-700 ring-zinc-200';
  }
}

function formatClock(value?: string): string {
  if (!value) return '—';
  return value;
}

function formatUpdated(value?: string): string {
  if (!value) return 'Updated recently';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated recently';

  return `Updated ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export default function FlightStatusBoard({
  flightInput,
  airportCode,
  legType = 'departure',
}: {
  flightInput?: string | null;
  airportCode: string;
  legType?: 'departure' | 'arrival';
}) {
  const flight = flightInput
    ? getMockFlightStatus(flightInput, airportCode, legType)
    : null;

  if (!flightInput) {
    return (
      <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">Flight status</div>
        <p className="mt-1 text-sm text-zinc-600">
          Add a flight number to see departure, arrival, gate, terminal, and status updates.
        </p>
      </section>
    );
  }

  if (!flight) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Flight status</div>
        <p className="mt-1 text-sm text-zinc-600">
          Couldn’t read this flight yet. Try using a format like AS123, DL456, or UA789.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-950 text-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Flight status
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {flight.flightNumber}
            </h2>
            {flight.airlineName && (
              <span className="text-sm text-zinc-300">{flight.airlineName}</span>
            )}
          </div>

          <div className="mt-1 text-sm text-zinc-300">
            {flight.originAirportCode || '—'} → {flight.destinationAirportCode || '—'}
          </div>
        </div>

        <div
          className={
            'inline-flex w-fit rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ' +
            statusClass(flight.status)
          }
        >
          {flight.statusLabel}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
        <div className="bg-zinc-950 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Scheduled
          </div>
          <div className="mt-1 text-xl font-semibold">
            {formatClock(flight.scheduledTime)}
          </div>
        </div>

        <div className="bg-zinc-950 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Estimated
          </div>
          <div className="mt-1 text-xl font-semibold">
            {formatClock(flight.estimatedTime)}
          </div>
        </div>

        <div className="bg-zinc-950 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Gate
          </div>
          <div className="mt-1 text-xl font-semibold">
            {flight.gate || '—'}
          </div>
        </div>

        <div className="bg-zinc-950 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Terminal
          </div>
          <div className="mt-1 text-xl font-semibold">
            {flight.concourse || flight.terminal || '—'}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
        <div>
          Source: {flight.sourceName}
          {flight.sourceType === 'mock' ? ' · Demo data' : ''}
        </div>
        <div>{formatUpdated(flight.lastUpdated)}</div>
      </div>

      {flight.notes?.length ? (
        <div className="border-t border-white/10 px-4 py-3 text-xs text-amber-200">
          {flight.notes[0]}
        </div>
      ) : null}
    </section>
  );
}