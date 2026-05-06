'use client';

import { getMockFlightStatus } from '../../lib/flights/mockFlightStatus';
import { FlightLegType, FlightStatusResult } from '../../lib/flights/types';

function statusPillClass(status: FlightStatusResult['status']): string {
  switch (status) {
    case 'boarding':
      return 'bg-blue-100 text-blue-800';
    case 'delayed':
      return 'bg-amber-100 text-amber-900';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'departed':
    case 'arrived':
      return 'bg-emerald-100 text-emerald-800';
    case 'scheduled':
    default:
      return 'bg-zinc-100 text-zinc-700';
  }
}

const demoDepartures = [
  'AS123',
  'DL221',
  'UA440',
  'WN889',
  'AA715',
  'AS738',
  'B6124',
  'UA907',
];

const demoArrivals = [
  'AS456',
  'DL882',
  'UA120',
  'WN331',
  'AA204',
  'AS909',
  'B6990',
  'UA777',
];

export default function AirportFlightBoard({
  airportCode,
  legType,
  highlightFlight,
}: {
  airportCode: string;
  legType: FlightLegType;
  highlightFlight?: string | null;
}) {
  const flightNumbers = legType === 'arrival' ? demoArrivals : demoDepartures;

  const flights = flightNumbers
    .map((flightNumber) => getMockFlightStatus(flightNumber, airportCode, legType))
    .filter(Boolean) as FlightStatusResult[];

  const normalizedHighlight = highlightFlight?.replace(/\s+/g, '').toUpperCase();

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-white shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Airport board
          </div>
          <h3 className="text-base font-semibold text-white">
            {legType === 'arrival' ? 'Arrivals near your trip' : 'Departures near your trip'}
          </h3>
        </div>

        <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-zinc-300">
          Demo board
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-semibold">
                {legType === 'arrival' ? 'From' : 'To'}
              </th>
              <th className="px-4 py-3 font-semibold">Airline</th>
              <th className="px-4 py-3 font-semibold">Flight</th>
              <th className="px-4 py-3 font-semibold">Gate</th>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>

          <tbody>
            {flights.map((flight) => {
              const isHighlight =
                normalizedHighlight &&
                flight.flightNumber.replace(/\s+/g, '').toUpperCase() === normalizedHighlight;

              return (
                <tr
                  key={flight.flightNumber}
                  className={
                    'border-b border-white/10 last:border-b-0 ' +
                    (isHighlight ? 'bg-blue-600/25' : 'hover:bg-white/5')
                  }
                >
                  <td className="px-4 py-3 font-semibold text-white">
                    {legType === 'arrival'
                      ? flight.originAirportCode || '—'
                      : flight.destinationAirportCode || '—'}
                  </td>

                  <td className="px-4 py-3 text-zinc-300">
                    {flight.airlineName || flight.airlineCode || '—'}
                  </td>

                  <td className="px-4 py-3 font-semibold text-white">
                    {flight.flightNumber}
                  </td>

                  <td className="px-4 py-3 text-zinc-300">
                    {flight.gate || '—'}
                  </td>

                  <td className="px-4 py-3 text-zinc-300">
                    {flight.estimatedTime || flight.scheduledTime || '—'}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={
                        'rounded-full px-2.5 py-1 text-xs font-semibold ' +
                        statusPillClass(flight.status)
                      }
                    >
                      {flight.statusLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-white/10 px-4 py-3 text-xs text-amber-200">
        Demo board data. Live provider can replace this with real airport departures,
        arrivals, gate changes, boarding, and baggage claim updates.
      </div>
    </section>
  );
}