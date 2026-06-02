'use client';

import { useMemo, useState } from 'react';
import { buildLocalDateTime } from '../../lib/tripTime';
import type { RouteLookaheadMode, RouteLookaheadResponse } from '../../lib/routes/routeLookahead';

type RouteLookaheadPanelProps = {
  origin: string;
  destination: string;
  airportCode: string;
  destinationLatLng?: { lat: number; lng: number } | null;
  departureDate?: string | null;
  departureTime?: string | null;
  airportBufferMinutes?: number | null;
  disabled?: boolean;
  className?: string;
};

type ScenarioChip = {
  id: string;
  label: string;
  mode: RouteLookaheadMode;
  targetTime: string;
};

function formatIsoTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function subtractHours(isoBase: Date, hours: number): string {
  return new Date(isoBase.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function subtractMinutes(isoBase: Date, minutes: number): string {
  return new Date(isoBase.getTime() - minutes * 60 * 1000).toISOString();
}

export default function RouteLookaheadPanel({
  origin,
  destination,
  airportCode,
  destinationLatLng = null,
  departureDate = null,
  departureTime = null,
  airportBufferMinutes = null,
  disabled = false,
  className = '',
}: RouteLookaheadPanelProps) {
  const [activeChipId, setActiveChipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RouteLookaheadResponse | null>(null);

  const chips = useMemo(() => {
    const options: ScenarioChip[] = [
      {
        id: 'now',
        label: 'Now',
        mode: 'depart_at',
        targetTime: '',
      },
    ];

    const flight =
      departureDate && departureTime
        ? buildLocalDateTime(departureDate, departureTime)
        : null;

    if (flight) {
      options.push(
        {
          id: 'leave-2h',
          label: 'Leave 2h before flight',
          mode: 'depart_at',
          targetTime: subtractHours(flight, 2),
        },
        {
          id: 'leave-2_5h',
          label: 'Leave 2.5h before flight',
          mode: 'depart_at',
          targetTime: subtractHours(flight, 2.5),
        },
        {
          id: 'leave-3h',
          label: 'Leave 3h before flight',
          mode: 'depart_at',
          targetTime: subtractHours(flight, 3),
        },
      );

      if (typeof airportBufferMinutes === 'number' && airportBufferMinutes > 0) {
        options.push({
          id: 'arrive-by-airport',
          label: 'Arrive by airport',
          mode: 'arrive_by',
          targetTime: subtractMinutes(flight, airportBufferMinutes),
        });
      }
    }

    return options;
  }, [airportBufferMinutes, departureDate, departureTime]);

  async function runScenario(chip: ScenarioChip) {
    if (disabled || !origin.trim()) return;

    setActiveChipId(chip.id);
    setLoading(true);
    setError(null);

    try {
      const targetTime = chip.id === 'now' ? new Date().toISOString() : chip.targetTime;

      const response = await fetch('/api/routes/lookahead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          destination,
          airportCode,
          destinationLatLng,
          mode: chip.mode,
          targetTime,
          travelMode: 'DRIVE',
        }),
      });

      const json = (await response.json()) as RouteLookaheadResponse & {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(json.message || json.error || 'Route lookahead failed.');
      }

      if (json.routeUnavailable) {
        setResult(json);
        setError(json.routeUnavailableReason || 'Route timing unavailable.');
        return;
      }

      setResult(json);
    } catch (fetchError) {
      setResult(null);
      setError(fetchError instanceof Error ? fetchError.message : 'Route lookahead failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={
        'rounded-2xl border border-slate-900/10 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-4 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] ' +
        className
      }
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200/80">
        Test leave times
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        Traffic estimate based on selected time.
      </p>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">
        Google Places remains disabled; this only checks routing.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => {
          const isActive = activeChipId === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              disabled={disabled || loading}
              onClick={() => runScenario(chip)}
              className={
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition ' +
                (isActive
                  ? 'border-sky-300/40 bg-sky-400/15 text-sky-100'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10') +
                (disabled ? ' cursor-not-allowed opacity-50' : '')
              }
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="mt-3 text-sm text-slate-300">Checking route timing…</div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          {error}
        </div>
      ) : null}

      {result && !result.routeUnavailable ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/6 px-3 py-2.5 text-sm">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Leave at</div>
              <div className="font-semibold text-white">{formatIsoTime(result.leaveAt)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Arrive at</div>
              <div className="font-semibold text-white">{formatIsoTime(result.arriveAt)}</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-300">
            Drive time: {result.trafficAwareMinutes} min
            {result.source === 'cache' ? ' · cached route' : ' · live route'}
          </div>
        </div>
      ) : null}
    </div>
  );
}
