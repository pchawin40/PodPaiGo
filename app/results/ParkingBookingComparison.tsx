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
  const offsites = parkingOptions.filter(p => p.type === 'off-airport');
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
    <details className="mt-3 rounded-xl border border-zinc-200 bg-white shadow-sm">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-900">Compare booking options</summary>
      <div className="px-4 pb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-2">Provider</th>
                <th className="py-2">Price</th>
                <th className="w-[320px] py-2">Notes</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.provider} className="border-t border-zinc-100">
                  <td className="py-3 font-medium text-zinc-900">{r.provider}</td>
                  <td className="py-3 text-zinc-900">{r.price}</td>
                  <td className="py-3 text-zinc-700">{r.notes}</td>
                  <td className="py-3 text-right">
                    {r.link ? (
                      <a href={r.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">Open</a>
                    ) : (
                      <span className="text-xs text-zinc-600">Last checked unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
