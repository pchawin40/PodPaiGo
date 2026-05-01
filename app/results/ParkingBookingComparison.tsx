'use client';

import React from 'react';
import { googleMapsSearchLink } from '../../lib/providerCatalog';

function getAprLivePrice(option: any, aprLivePrices: Record<string, number>): number | null {
  const sourceLink = option?.sourceLink;
  if (!sourceLink) return null;
  const livePrice = aprLivePrices[sourceLink];
  return typeof livePrice === 'number' && livePrice > 0 ? livePrice : null;
}

function withAprLivePrice(option: any, aprLivePrices: Record<string, number>) {
  const livePrice = getAprLivePrice(option, aprLivePrices);
  if (livePrice == null) return option;

  return {
    ...option,
    price: livePrice,
    priceDisplay: 'from-per-day' as const,
    priceUnit: 'per-day' as const,
    trustStatus: 'live',
    priceNote: 'APR listed price',
    bestFor: Array.from(new Set(['APR listed price', ...(option.bestFor || [])])),
  };
}

export default function ParkingBookingComparison({ parkingOptions, tripData, aprLivePrices = {}, aprLiveChecking = false }: { parkingOptions: any[]; tripData: any; aprLivePrices?: Record<string, number>; aprLiveChecking?: boolean }) {
  if (!parkingOptions || parkingOptions.length === 0) return null;

  const parkingOptionsWithLive = parkingOptions.map((option) => withAprLivePrice(option, aprLivePrices));

  const parkingOptionsWithApr = parkingOptionsWithLive.map((option) => ({
    option,
    livePrice: getAprLivePrice(option, aprLivePrices),
    isApr: option.bookingProvider === 'AirportParkingReservations' && !!option.sourceLink,
  }));

  // Build a list of known booking rows based on providers present.
  // For safety, do not invent live prices.
  const rows: Array<{ provider: string; price: string; notes: string; link?: string; sortOrder: number }> = [];

  // Helper to push unique provider rows
  function pushRow(provider: string, price: string, notes: string, link?: string, sortOrder = 2) {
    if (!rows.find(r => r.provider === provider)) rows.push({ provider, price, notes, link, sortOrder });
  }

  // Find if SEA official present
  const seaReserved = parkingOptionsWithLive.find(p => p.id === 'sea-reserved' || p.name?.toLowerCase().includes('reserved'));
  const seaGeneral = parkingOptionsWithLive.find(p => p.id === 'sea-general' || p.name?.toLowerCase().includes('general'));

  if (seaReserved) {
    const isLiveSelected = seaReserved.trustStatus === 'live' && String(seaReserved.priceNote || '').toLowerCase().includes('selected-date');
    const price = isLiveSelected
      ? `Live ${seaReserved.price ? `$${seaReserved.price}/day` : 'Check live'}`
      : seaReserved.priceDisplay === 'from-per-day'
        ? `From ${seaReserved.price ? `$${seaReserved.price}/day` : 'Check live'}`
        : 'Check live';
    pushRow(
      'Official SEA (Reserved)',
      price,
      isLiveSelected ? 'Live selected-date' : 'Official',
      seaReserved.sourceLink,
      isLiveSelected ? 0 : 1
    );
  }

  if (seaGeneral) {
    const isLiveSelected = seaGeneral.trustStatus === 'live' && String(seaGeneral.priceNote || '').toLowerCase().includes('selected-date');
    const price = isLiveSelected
      ? `Live ${seaGeneral.price ? `$${seaGeneral.price}/day` : 'Check live'}`
      : seaGeneral.priceDisplay === 'from-per-day'
        ? `From ${seaGeneral.price ? `$${seaGeneral.price}/day` : 'Check live'}`
        : 'Check live';
    pushRow(
      'Official SEA (General)',
      price,
      isLiveSelected ? 'Live selected-date' : 'Official',
      seaGeneral.sourceLink,
      isLiveSelected ? 0 : 1
    );
  }

  // Offsite lots - for each one, add direct site + marketplace rows
  const offsites = parkingOptionsWithLive.filter((p) => {
    const unavailable =
      p.availabilityStatus === 'unavailable' ||
      p.isAvailable === false ||
      p.priceDisplay === 'unavailable' ||
      String(p.priceNote || '').toLowerCase().includes('sold out');

    return p.type === 'off-airport' && !unavailable;
  });
  offsites.forEach(p => {
    const baseProviderName = p.name;
    const isSelectedPrice = String(p.priceNote || '').toLowerCase().includes('selected-date');
    const hasLivePrice = p.trustStatus === 'live' && isSelectedPrice;
    const isAwaitingApr = aprLiveChecking && p.bookingProvider === 'AirportParkingReservations' && !hasLivePrice;
    const directPrice = hasLivePrice
      ? `Live ${p.price ? `$${p.price}/day` : 'Check live'}`
      : p.priceDisplay === 'from-per-day'
        ? p.price
          ? `From $${p.price}/day`
          : 'Check live'
        : p.priceDisplay === 'estimated'
          ? `Est. $${p.price}`
          : 'Check live';

    pushRow(
      `${baseProviderName} (Direct)`,
      directPrice,
      hasLivePrice
        ? 'Live selected-date'
        : isAwaitingApr
          ? 'Checking latest price...'
          : directPrice.startsWith('From')
            ? 'Listed rate'
            : 'Check live',
      p.sourceLink,
      hasLivePrice ? 0 : 2
    );
    // Marketplace rows (SpotHero, Way.com)
    pushRow('SpotHero', 'Check live', 'Marketplace', 'https://spothero.com', 3);
    pushRow('Way.com', 'Check live', 'Marketplace', 'https://way.com', 3);
  });

  // If no offsites, still show marketplace examples
  if (offsites.length === 0) {
    pushRow('SpotHero', 'Check live', 'Marketplace', 'https://spothero.com', 3);
    pushRow('Way.com', 'Check live', 'Marketplace', 'https://way.com', 3);
  }

  const sortedRows = [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.provider.localeCompare(b.provider));

  return (
    <details className="w-full rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <summary className="w-full cursor-pointer px-5 py-4 text-base font-medium text-zinc-900">
        Compare booking options
      </summary>
      <div className="px-4 pb-4">
        <div className="mt-3">
          <div className="space-y-2">
            {sortedRows.map((r) => (
              <div
                key={r.provider}
                className="flex flex-col gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">
                    {r.provider}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
                      {r.price}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
                      {r.notes}
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  {r.link ? (
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:w-auto"
                    >
                      Open
                    </a>
                  ) : (
                    <span className="text-xs text-zinc-500">Unavailable</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
