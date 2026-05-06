import { getAirportOrFallback } from '../../lib/airports/catalog';
import { TrustStatus } from '../../lib/types';

function trustLabel(trustStatus?: TrustStatus): string {
    switch (trustStatus) {
        case 'live':
            return 'Live';
        case 'verified-source':
            return 'Official';
        case 'estimated':
            return 'Estimated';
        case 'fallback':
        default:
            return 'Guide';
    }
}

function trustClassName(trustStatus?: TrustStatus): string {
    switch (trustStatus) {
        case 'live':
            return 'border-emerald-200 bg-emerald-50 text-emerald-800';
        case 'verified-source':
            return 'border-blue-200 bg-blue-50 text-blue-800';
        case 'estimated':
            return 'border-amber-200 bg-amber-50 text-amber-900';
        case 'fallback':
        default:
            return 'border-zinc-200 bg-zinc-100 text-zinc-700';
    }
}

export default function AirportGuideCard({
    airportCode,
    airlineOrFlight,
}: {
    airportCode?: string;
    airlineOrFlight?: string | null;
}) {
    const airport = getAirportOrFallback(airportCode);

    const terminalCount = airport.terminals?.length || 0;
    const checkinCount = airport.checkinAreas?.length || 0;

    const primaryTerminal = airport.terminals?.[0];
    const primaryCheckin = airport.checkinAreas?.[0];

    return (
        <section className="overflow-hidden rounded-2xl bg-white">
            {/* Top action row */}
            <div className="flex flex-col gap-4 border-b border-zinc-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Airport guide
                        </span>

                        {airport.airportMap && (
                            <span
                                className={
                                    'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ' +
                                    trustClassName(airport.airportMap.trustStatus)
                                }
                            >
                                {trustLabel(airport.airportMap.trustStatus)} map
                            </span>
                        )}
                    </div>

                    <h2 className="mt-1 truncate text-lg font-semibold text-zinc-900 sm:text-xl">
                        {airport.id} — {airport.label}
                    </h2>

                    <p className="mt-1 line-clamp-2 text-sm text-zinc-600">
                        {airport.genericGuidance ||
                            airport.checkinNote ||
                            'Confirm check-in, terminal, and gate details with your airline before leaving.'}
                    </p>

                    {airlineOrFlight && (
                        <div className="mt-2 text-xs font-medium text-zinc-500">
                            Flight input: <span className="text-zinc-800">{airlineOrFlight}</span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-w-[360px]">
                    {airport.airportMap && (
                        <a
                            href={airport.airportMap.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                        >
                            Open airport map
                        </a>
                    )}

                    {airport.officialAirportUrl && (
                        <a
                            href={airport.officialAirportUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                        >
                            Official airport site
                        </a>
                    )}
                </div>
            </div>

            {/* Quick info strip */}
            <div className="grid grid-cols-1 divide-y divide-zinc-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="p-4 sm:p-5">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Map source
                    </div>

                    <div className="mt-1 text-sm font-semibold text-zinc-900">
                        {airport.airportMap?.sourceName || 'Not saved yet'}
                    </div>

                    <div className="mt-1 text-xs text-zinc-500">
                        {airport.airportMap?.label || 'Use the official airport website for now.'}
                    </div>
                </div>

                <div className="p-4 sm:p-5">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Terminals
                    </div>

                    <div className="mt-1 text-sm font-semibold text-zinc-900">
                        {terminalCount > 0
                            ? `${terminalCount} terminal area${terminalCount === 1 ? '' : 's'} saved`
                            : 'Terminal details pending'}
                    </div>

                    <div className="mt-1 text-xs text-zinc-500">
                        {primaryTerminal
                            ? `${primaryTerminal.label}${primaryTerminal.notes ? ` · ${primaryTerminal.notes}` : ''}`
                            : 'Confirm terminal in your airline app.'}
                    </div>
                </div>

                <div className="p-4 sm:p-5">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Check-in / gates
                    </div>

                    <div className="mt-1 text-sm font-semibold text-zinc-900">
                        {checkinCount > 0
                            ? primaryCheckin?.label || 'Check-in guidance saved'
                            : 'Live gate data pending'}
                    </div>

                    <div className="mt-1 text-xs text-zinc-500">
                        {primaryCheckin?.notes ||
                            'Gate and terminal can change. Confirm with airline or airport display.'}
                    </div>
                </div>
            </div>

            {/* Mobile-friendly final warning, less visually heavy */}
            <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600 sm:px-5">
                Gates and terminals can change. Use PodPaiGo for planning, then confirm with your
                airline app or airport display before leaving.
            </div>
        </section>
    );
}