'use client';

import { buildAirportTripCardModel } from '../../lib/airports/airportGuide';

type AirportTripCardProps = {
  airportCode: string;
  airlineOrFlight?: string | null;
  leaveByTime?: string | null;
  parkingPickName?: string | null;
  checkingBags?: boolean;
  className?: string;
};

function formatLeaveBy(value: string | null): string | null {
  if (!value) return null;

  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;

  const hour = Number(match[1]);
  const minute = match[2];
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute} ${meridiem}`;
}

export default function AirportTripCard({
  airportCode,
  airlineOrFlight,
  leaveByTime,
  parkingPickName,
  checkingBags = false,
  className = '',
}: AirportTripCardProps) {
  const model = buildAirportTripCardModel({
    airportCode,
    airlineOrFlight,
    leaveByTime,
    parkingPickName,
    checkingBags,
  });

  if (!model) return null;

  const formattedLeaveBy = formatLeaveBy(model.leaveByTime);

  return (
    <div
      className={
        'overflow-hidden rounded-[28px] border border-slate-900/10 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 text-white shadow-[0_20px_50px_rgba(15,23,42,0.28)] ' +
        className
      }
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/80">
            Airport Trip Card
          </div>
          <div className="mt-1 text-lg font-bold">{model.airportCode}</div>
          <div className="text-sm text-slate-300">{model.city}</div>
        </div>
        <div className="rounded-2xl bg-white/10 px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-300">Leave by</div>
          <div className="text-base font-semibold">{formattedLeaveBy || 'TBD'}</div>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/8 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-300">Airline</div>
            <div className="mt-1 text-sm font-semibold">{model.airlineLabel || 'Not provided'}</div>
          </div>
          <div className="rounded-2xl bg-white/8 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-300">Terminal</div>
            <div className="mt-1 text-sm font-semibold">{model.terminalLabel || 'Confirm at airport'}</div>
          </div>
        </div>

        {model.parkingPickName ? (
          <div className="rounded-2xl bg-white/8 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-300">Parking pick</div>
            <div className="mt-1 text-sm font-semibold">{model.parkingPickName}</div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {model.tsaPreCheckAvailable ? (
            <span className="rounded-full border border-sky-300/30 bg-sky-400/10 px-2.5 py-1 text-xs font-medium text-sky-100">
              TSA PreCheck
            </span>
          ) : null}
          {model.clearAvailable ? (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-100">
              CLEAR
            </span>
          ) : null}
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            Airport checklist
          </div>
          <ul className="mt-2 space-y-2">
            {model.checklist.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-xl bg-white/6 px-3 py-2 text-sm text-slate-100"
              >
                <span
                  className={
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ' +
                    (item.done ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-slate-300')
                  }
                >
                  {item.done ? '✓' : '○'}
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs leading-5 text-slate-400">{model.disclaimer}</p>
      </div>
    </div>
  );
}
