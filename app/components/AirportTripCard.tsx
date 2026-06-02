'use client';

import Link from 'next/link';
import { buildAirportTripCardModel } from '../../lib/airports/airportGuide';
import {
  buildAirportDayTimeline,
  type AirportDayTransportMode,
} from '../../lib/airports/airportDayTimeline';
import { bagPlanLabel, resolveBagPlan } from '../../lib/airports/bagPlan';
import type { BagPlan, TripData } from '../../lib/types';
import AirportDayTimeline from './AirportDayTimeline';
import AirportTravelChecklist from './AirportTravelChecklist';
import SaveAccountTripButton from './SaveAccountTripButton';

type AirportTripCardProps = {
  airportCode: string;
  airlineOrFlight?: string | null;
  leaveByTime?: string | null;
  parkingPickName?: string | null;
  bagPlan?: BagPlan;
  checkingBags?: boolean;
  transportMode?: AirportDayTransportMode;
  transportModeLabel?: string | null;
  travelMinutes?: number | null;
  shuttleWalkMinutes?: number | null;
  departureTime?: string | null;
  airportBufferMinutes?: number | null;
  bookingUrl?: string | null;
  directionsUrl?: string | null;
  returnDate?: string | null;
  intent?: string | null;
  tripData?: TripData | null;
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

function transportSummary(mode: AirportDayTransportMode, label: string | null): string {
  if (label?.trim()) return label.trim();
  if (mode === 'rideshare') return 'Rideshare / taxi';
  if (mode === 'transit') return 'Transit';
  if (mode === 'parking') return 'Parking';
  return 'Compare options on results';
}

export default function AirportTripCard({
  airportCode,
  airlineOrFlight,
  leaveByTime,
  parkingPickName,
  bagPlan,
  checkingBags = false,
  transportMode = null,
  transportModeLabel = null,
  travelMinutes = null,
  shuttleWalkMinutes = null,
  departureTime = null,
  airportBufferMinutes = null,
  bookingUrl = null,
  directionsUrl = null,
  returnDate = null,
  intent = null,
  tripData = null,
  className = '',
}: AirportTripCardProps) {
  const resolvedBagPlan = resolveBagPlan({ bagPlan, checkingBags });

  const model = buildAirportTripCardModel({
    airportCode,
    airlineOrFlight,
    leaveByTime,
    parkingPickName,
    bagPlan: resolvedBagPlan,
  });

  if (!model) return null;

  const formattedLeaveBy = formatLeaveBy(model.leaveByTime);
  const timeline = buildAirportDayTimeline({
    leaveByTime: model.leaveByTime,
    departureTime,
    travelMinutes,
    airportBufferMinutes,
    transportMode,
    shuttleWalkMinutes,
    parkingPickName: model.parkingPickName,
  });

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
            Airport day companion
          </div>
          <div className="mt-1 text-lg font-bold">{model.airportCode}</div>
          <div className="text-sm text-slate-300">{model.city}</div>
        </div>
        <div className="rounded-2xl bg-white/10 px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-300">Leave by</div>
          <div className="text-base font-semibold">{formattedLeaveBy || 'TBD'}</div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/8 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-300">Flight</div>
            <div className="mt-1 text-sm font-semibold">
              {model.normalizedFlightLabel || model.airlineLabel || 'Not provided'}
            </div>
            {model.flightNumber && model.airlineCode ? (
              <div className="mt-1 text-xs text-slate-400">
                {model.airlineCode} {model.flightNumber}
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl bg-white/8 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-300">Terminal</div>
            <div className="mt-1 text-sm font-semibold">
              {model.terminalLabel || 'Confirm at airport'}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/8 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-300">Getting there</div>
            <div className="mt-1 text-sm font-semibold">
              {transportSummary(transportMode, transportModeLabel)}
            </div>
            {model.parkingPickName ? (
              <div className="mt-1 text-xs text-slate-400">{model.parkingPickName}</div>
            ) : null}
          </div>
          <div className="rounded-2xl bg-white/8 p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-300">Bag plan</div>
            <div className="mt-1 text-sm font-semibold">{bagPlanLabel(resolvedBagPlan)}</div>
            {model.bagPlanExplanation ? (
              <div className="mt-1 text-xs text-slate-400">{model.bagPlanExplanation}</div>
            ) : null}
          </div>
        </div>

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

        <AirportDayTimeline milestones={timeline} />

        <AirportTravelChecklist
          bagPlan={resolvedBagPlan}
          hasParkingOrRidesharePlan={Boolean(model.parkingPickName || transportMode === 'rideshare')}
          returnDate={returnDate}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {tripData ? (
            <SaveAccountTripButton
              tripData={tripData}
              intent={intent}
              className="w-full sm:w-auto"
            />
          ) : null}
          {bookingUrl ? (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400"
            >
              Reserve parking
            </a>
          ) : null}
          {directionsUrl ? (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
            >
              Open directions
            </a>
          ) : null}
          {!tripData ? (
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15"
            >
              Save trip
            </Link>
          ) : null}
        </div>

        <p className="text-xs leading-5 text-slate-400">{model.disclaimer}</p>
      </div>
    </div>
  );
}
