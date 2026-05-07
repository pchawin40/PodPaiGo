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
    const embeddableIndoorMap =
        indoorMap?.embeddable && indoorMap.embedUrl ? indoorMap : null;

    if (embeddableIndoorMap) {
        return (
            <div className="flex h-full flex-col bg-white">
                <div className="flex shrink-0 flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Official indoor airport map
                        </div>
                        <h2 className="mt-0.5 text-lg font-semibold text-zinc-950">
                            {airport.id} — {embeddableIndoorMap.label}
                        </h2>
                        <div className="mt-0.5 text-xs text-zinc-500">
                            Source: {embeddableIndoorMap.sourceName}
                            {airlineOrFlight ? ` · Flight input: ${airlineOrFlight}` : ''}
                        </div>
                    </div>

                    <a
                        href={embeddableIndoorMap.url}
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
                        src={embeddableIndoorMap.embedUrl}
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
        <div className="h-full bg-slate-100 p-6">
            <div className="mx-auto flex h-full max-w-5xl flex-col justify-center">
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-200 bg-white p-6">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Official airport map
                        </div>

                        <h2 className="mt-2 text-3xl font-bold text-slate-950">
                            {airport.id} — {airport.destinationName}
                        </h2>

                        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                            {indoorMap?.url
                                ? 'This airport’s official map opens best in a new tab. Use it for the most accurate terminal, gate, restroom, restaurant, and check-in details.'
                                : 'We do not have an official airport map link for this airport yet. Use the airport website or airline app to confirm terminal, gate, restroom, restaurant, and check-in details.'}
                        </p>

                        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
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

                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                    airport.routingAddress
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                            >
                                Open in Google Maps
                            </a>

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

                    <div className="grid gap-0 bg-slate-50 md:grid-cols-3">
                        <div className="border-b border-slate-200 p-6 md:border-b-0 md:border-r">
                            <div className="text-sm font-semibold text-slate-900">Check-in</div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                {airport.checkinNote || 'Confirm check-in area with your airline before leaving.'}
                            </p>
                        </div>

                        <div className="border-b border-slate-200 p-6 md:border-b-0 md:border-r">
                            <div className="text-sm font-semibold text-slate-900">Airport guidance</div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                {airport.genericGuidance || 'Confirm terminal, gate, and boarding details before leaving.'}
                            </p>
                        </div>

                        <div className="p-6">
                            <div className="text-sm font-semibold text-slate-900">Best used for</div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                Terminal layout, gates, food, restrooms, baggage claim, and ground transportation.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}