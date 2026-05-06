import { getAirportById } from '../../lib/airports/catalog';

export default function AirportTerminalMap({
  airportCode,
  airlineOrFlight,
}: {
  airportCode?: string;
  airlineOrFlight?: string | null;
}) {
  const airport =
    getAirportById((airportCode || 'SEA').toUpperCase()) || getAirportById('SEA')!;

  const indoorMap = airport.indoorMap;

  if (indoorMap?.embeddable && indoorMap.embedUrl) {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex shrink-0 flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Official indoor airport map
            </div>
            <h2 className="mt-0.5 text-lg font-semibold text-zinc-950">
              {airport.id} — {indoorMap.label}
            </h2>
            <div className="mt-0.5 text-xs text-zinc-500">
              Source: {indoorMap.sourceName}
              {airlineOrFlight ? ` · Flight input: ${airlineOrFlight}` : ''}
            </div>
          </div>

          <a
            href={indoorMap.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Open full map
          </a>
        </div>

        <div className="min-h-0 flex-1 bg-zinc-100">
          <iframe
            title={`${airport.id} indoor airport map`}
            src={indoorMap.embedUrl}
            className="h-full w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allow="fullscreen"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-6">
      <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Official airport map
        </div>

        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          {airport.id} — {airport.destinationName}
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          This airport has an official map link, but it may not allow embedding inside
          PodPaiGo. Open it directly for the most accurate terminal, gate, restroom,
          restaurant, and check-in details.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {indoorMap?.url && (
            <a
              href={indoorMap.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Open official map
            </a>
          )}

          {airport.officialAirportUrl && (
            <a
              href={airport.officialAirportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Airport website
            </a>
          )}
        </div>
      </div>
    </div>
  );
}