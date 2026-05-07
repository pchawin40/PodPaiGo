import { getAirportById } from '../../lib/airports/catalog';

type IndoorMapLike = {
    provider?: string;
    label: string;
    sourceName: string;
    url: string;
    embedUrl?: string;
    embeddable?: boolean;
    mapType?: string;
};

function isStaticImageMap(map?: IndoorMapLike | null): boolean {
    if (!map) return false;

    const type = map.mapType || '';
    const url = map.embedUrl || map.url || '';

    return (
        type === 'official-static-image' ||
        url.toLowerCase().endsWith('.png') ||
        url.toLowerCase().endsWith('.jpg') ||
        url.toLowerCase().endsWith('.jpeg') ||
        url.toLowerCase().endsWith('.webp')
    );
}

function canRenderIframe(map?: IndoorMapLike | null): boolean {
    if (!map?.embeddable || !map.embedUrl) return false;
    if (isStaticImageMap(map)) return false;

    return true;
}

export default function AirportTerminalMap({
    airportCode,
    airlineOrFlight,
}: {
    airportCode?: string;
    airlineOrFlight?: string | null;
}) {
    const airport =
        getAirportById((airportCode || 'SEA').toUpperCase()) || getAirportById('SEA')!;

    const indoorMap = airport.indoorMap as IndoorMapLike | undefined;

    const mapUrl =
        indoorMap?.url ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            airport.routingAddress
        )}`;

    const sourceName = indoorMap?.sourceName || 'Google Maps fallback';
    const label = indoorMap?.label || `${airport.destinationName} location map`;

    const showStaticImage = indoorMap?.embeddable && isStaticImageMap(indoorMap);
    const showIframe = canRenderIframe(indoorMap);

    const header = (
        <div className="flex shrink-0 flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Airport map
                </div>
                <h2 className="mt-0.5 text-lg font-semibold text-zinc-950">
                    {airport.id} — {label}
                </h2>
                <div className="mt-0.5 text-xs text-zinc-500">
                    Source: {sourceName}
                    {airlineOrFlight ? ` · Flight input: ${airlineOrFlight}` : ''}
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
                <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                    Open map
                </a>

                {airport.officialAirportUrl && (
                    <a
                        href={airport.officialAirportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                        Airport website
                    </a>
                )}
            </div>
        </div>
    );

    if (showIframe && indoorMap?.embedUrl) {
        return (
            <div className="flex h-full flex-col bg-white">
                {header}

                <div className="min-h-0 flex-1 bg-zinc-100">
                    <iframe
                        title={`${airport.id} airport map`}
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

    if (showStaticImage && indoorMap?.embedUrl) {
        return (
            <div className="flex h-full flex-col bg-white">
                {header}

                <div className="min-h-0 flex-1 overflow-auto bg-zinc-100 p-4">
                    <div className="mx-auto flex min-h-full w-full items-start justify-center">
                        <img
                            src={indoorMap.embedUrl}
                            alt={`${airport.id} airport map`}
                            className="max-h-none max-w-none rounded-xl border border-zinc-200 bg-white shadow-sm"
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-white">
            {header}

            <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-100 p-6">
                <div className="max-w-xl rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Open official map
                    </div>

                    <h2 className="mt-2 text-2xl font-bold text-slate-950">
                        {airport.id} — {airport.destinationName}
                    </h2>

                    <p className="mt-3 text-sm leading-6 text-slate-600">
                        This official map cannot be displayed inside PodPaiGo because the source website blocks embedded viewing. Open it in a new tab for the most accurate airport map.
                    </p>

                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                            Open map
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
            </div>
        </div>
    );
}