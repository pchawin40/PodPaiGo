'use client';

import React from 'react';
import { googleMapsSearchLink } from '../../lib/providerCatalog';

export default function ParkingBookingComparison({ parkingOptions, tripData }: { parkingOptions: any[]; tripData: any }) {
  if (!parkingOptions || parkingOptions.length === 0) return null;

  // Build a list of known booking rows based on providers present.
  // For safety, do not invent live prices.
  const rows: Array<{ provider: string; price: string; notes: string; link?: string }> = [];

  // Helper to push unique provider rows
  function pushRow(provider: string, price: string, notes: string, link?: string) {
    if (!rows.find(r => r.provider === provider)) rows.push({ provider, price, notes, link });
  }

  // Find if SEA official present
  const seaReserved = parkingOptions.find(p => p.id === 'sea-reserved' || p.name?.toLowerCase().includes('reserved'));
  const seaGeneral = parkingOptions.find(p => p.id === 'sea-general' || p.name?.toLowerCase().includes('general'));

  if (seaReserved) {
    const price = seaReserved.priceDisplay === 'from-per-day' ? `From ${seaReserved.price ? `$${seaReserved.price}/day` : 'Check live'}` : 'Check live';
    pushRow('Official SEA (Reserved)', price, 'Official', seaReserved.sourceLink);
  }

  if (seaGeneral) {
    const price = seaGeneral.priceDisplay === 'from-per-day' ? `From ${seaGeneral.price ? `$${seaGeneral.price}/day` : 'Check live'}` : 'Check live';
    pushRow('Official SEA (General)', price, 'Drive-up', seaGeneral.sourceLink);
  }

  // Offsite lots - for each one, add direct site + marketplace rows
  const offsites = parkingOptions.filter((p) => {
    const unavailable =
      p.availabilityStatus === 'unavailable' ||
      p.isAvailable === false ||
      p.priceDisplay === 'unavailable' ||
      String(p.priceNote || '').toLowerCase().includes('sold out');

    return p.type === 'off-airport' && !unavailable;
  });
  offsites.forEach(p => {
    const baseProviderName = p.name;
    const directPrice = p.priceDisplay === 'from-per-day' ? (p.price ? `From $${p.price}/day` : 'Check live') : (p.priceDisplay === 'estimated' ? `Est. $${p.price}` : 'Check live');
    pushRow(`${baseProviderName} (Direct)`, directPrice, p.trustStatus === 'verified-source' ? 'Official' : 'Estimated', p.sourceLink);
    // Marketplace rows (SpotHero, Way.com)
    pushRow('SpotHero', 'Check live', 'Marketplace', 'https://spothero.com');
    pushRow('Way.com', 'Check live', 'Marketplace', 'https://way.com');
  });

  // If no offsites, still show marketplace examples
  if (offsites.length === 0) {
    pushRow('SpotHero', 'Check live', 'Marketplace', 'https://spothero.com');
    pushRow('Way.com', 'Check live', 'Marketplace', 'https://way.com');
  }

  return (
    <details className="w-full rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <summary className="w-full cursor-pointer px-5 py-4 text-base font-medium text-zinc-900">
        Compare booking options
      </summary>
      <div className="px-4 pb-4">
        <div className="mt-3">
          <div className="space-y-2">
            {rows.map((r) => (
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
