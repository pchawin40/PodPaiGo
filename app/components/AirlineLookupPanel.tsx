'use client';

import { lookupAirlineGuide } from '../../lib/airports/airportGuide';

type AirlineLookupPanelProps = {
  airportCode: string;
  airlineOrFlight: string;
  className?: string;
};

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: 'sky' | 'emerald' | 'slate';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'sky'
        ? 'border-sky-200 bg-sky-50 text-sky-900'
        : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

export default function AirlineLookupPanel({
  airportCode,
  airlineOrFlight,
  className = '',
}: AirlineLookupPanelProps) {
  const trimmed = airlineOrFlight.trim();
  if (!trimmed) return null;

  const lookup = lookupAirlineGuide(airportCode, trimmed);
  if (!lookup) return null;

  return (
    <div className={`rounded-2xl border border-sky-100 bg-sky-50/70 p-4 ${className}`}>
      <div className="text-sm font-semibold text-slate-950">Airline check-in guidance</div>

      <div className="mt-2 flex flex-wrap gap-2">
        {lookup.tsaPreCheckAvailable ? <Badge label="TSA PreCheck available" tone="sky" /> : null}
        {lookup.clearAvailable ? <Badge label="CLEAR available" tone="emerald" /> : null}
        <Badge
          label={lookup.confidence === 'known' ? 'Terminal match found' : 'Confirm with airport'}
          tone={lookup.confidence === 'known' ? 'sky' : 'slate'}
        />
      </div>

      {lookup.terminal ? (
        <div className="mt-3 text-sm text-slate-800">
          Likely terminal: <span className="font-semibold">{lookup.terminal}</span>
          {lookup.concourse ? <span> · {lookup.concourse}</span> : null}
        </div>
      ) : null}

      <p className="mt-2 text-sm leading-6 text-slate-700">{lookup.checkInNote}</p>
      <p className="mt-2 text-xs text-slate-500">{lookup.disclaimer}</p>
    </div>
  );
}
