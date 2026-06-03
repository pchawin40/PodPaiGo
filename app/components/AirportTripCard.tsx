'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
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
import StatusPill from './ui/StatusPill';

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

function CompanionSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-white/10 bg-white/5 open:bg-white/6"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
          {title}
        </span>
        <span className="text-xs text-slate-400 transition group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="border-t border-white/10 px-4 pb-4 pt-3">{children}</div>
    </details>
  );
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

  const checklistStorageKey = [airportCode, departureTime, returnDate, airlineOrFlight]
    .filter(Boolean)
    .join(':');

  return (
    <div
      className={
        'overflow-hidden rounded-[28px] border border-travel-navy/20 bg-gradient-to-br from-travel-navy via-slate-900 to-sky-950 text-white shadow-[0_20px_50px_rgba(15,23,42,0.28)] ' +
        className
      }
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="primary" className="border-travel-sky/30 bg-travel-sky/15 text-travel-sky">
              {model.airportCode}
            </StatusPill>
            {model.normalizedFlightLabel || model.airlineLabel ? (
              <StatusPill tone="muted" className="border-white/15 bg-white/10 text-slate-100">
                {model.normalizedFlightLabel || model.airlineLabel}
              </StatusPill>
            ) : null}
          </div>
          <div className="mt-2 text-sm text-slate-300">{model.city}</div>
          <div className="mt-1 text-xs text-slate-400">
            {model.terminalLabel ? `Terminal ${model.terminalLabel}` : 'Confirm terminal at airport'}
          </div>
        </div>
        <div className="rounded-2xl border border-travel-sky/25 bg-travel-sky/10 px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-wide text-travel-sky/80">Leave by</div>
          <div className="text-lg font-bold text-travel-sky">{formattedLeaveBy || 'TBD'}</div>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        <CompanionSection title="Overview" defaultOpen>
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

          <div className="mt-3 flex flex-wrap gap-2">
            {model.tsaPreCheckAvailable ? (
              <StatusPill tone="accent" className="border-travel-teal/30 bg-travel-teal/10 text-travel-teal">
                TSA PreCheck
              </StatusPill>
            ) : null}
            {model.clearAvailable ? (
              <StatusPill tone="success" className="border-emerald-300/30 bg-emerald-400/10 text-emerald-100">
                CLEAR
              </StatusPill>
            ) : null}
          </div>
        </CompanionSection>

        <CompanionSection title="Timeline">
          <AirportDayTimeline milestones={timeline} showHeading={false} />
        </CompanionSection>

        <CompanionSection title="Checklist">
          <AirportTravelChecklist
            bagPlan={resolvedBagPlan}
            hasParkingOrRidesharePlan={Boolean(model.parkingPickName || transportMode === 'rideshare')}
            returnDate={returnDate}
            storageKey={checklistStorageKey}
            showHeading={false}
          />
        </CompanionSection>

        <CompanionSection title="Actions" defaultOpen>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {tripData ? (
              <SaveAccountTripButton tripData={tripData} intent={intent} className="w-full sm:w-auto" />
            ) : null}
            {bookingUrl ? (
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-travel-sky px-4 py-2.5 text-sm font-semibold text-travel-navy hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-travel-sky"
              >
                Reserve parking
              </a>
            ) : null}
            {directionsUrl ? (
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-travel-sky"
              >
                Open directions
              </a>
            ) : null}
            {!tripData ? (
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-travel-sky"
              >
                Save trip
              </Link>
            ) : null}
          </div>
        </CompanionSection>

        <p className="text-xs leading-5 text-slate-400">{model.disclaimer}</p>
      </div>
    </div>
  );
}
