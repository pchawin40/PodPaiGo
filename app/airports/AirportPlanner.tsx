import Link from "next/link";
import AirportTerminalMap from "../results/AirportTerminalMap";
import type { AirportInfo } from "../../lib/airports/catalog";

const plannerSignals = [
  "Parking and off-airport parking comparison",
  "Rideshare, taxi, and transit comparison",
  "Leave-by timing for departures",
  "Weather-aware parking preferences",
  "Walking burden and luggage effort estimates",
  "Price confidence and provider links",
];

function airportTripHref(airport: AirportInfo) {
  const params = new URLSearchParams({
    airport: airport.id,
    destination: airport.routingAddress,
  });

  return `/trip?${params.toString()}`;
}

function airportMapHref(airport: AirportInfo) {
  return (
    airport.indoorMap?.url ||
    airport.airportMap?.url ||
    airport.officialAirportUrl ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      airport.routingAddress
    )}`
  );
}

export default function AirportPlanner({ airport }: { airport: AirportInfo }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/airports" className="text-sm font-medium text-blue-700">
          ← Back to airports
        </Link>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                {airport.id} airport planning guide
              </p>

              <h1 className="mt-3 text-4xl font-bold tracking-tight">
                {airport.label} trip planner
              </h1>
            </div>

            <span className="inline-flex w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
              Airport planner
            </span>
          </div>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            Compare ways to get to {airport.destinationName}, including parking,
            rideshare, taxi, and transit options where available. PodPaiGo uses
            timing, cost, walking burden, weather exposure, route confidence, and
            airport-specific guidance to help plan the trip.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {plannerSignals.map((feature) => (
              <div
                key={feature}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
              >
                {feature}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={airportTripHref(airport)}
              className="inline-flex justify-center rounded-full bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Plan a trip to {airport.id}
            </Link>

            {airportMapHref(airport) && (
              <a
                href={airportMapHref(airport)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex justify-center rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 hover:bg-slate-50"
              >
                Airport map
              </a>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold">Airport guidance</h2>

            <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
              <div>
                <div className="font-semibold text-slate-900">Arrive at</div>
                <div>{airport.routingAddress}</div>
              </div>

              <div>
                <div className="font-semibold text-slate-900">Rideshare/taxi destination</div>
                <div>{airport.rideshareDestinationName}</div>
              </div>

              <div>
                <div className="font-semibold text-slate-900">Check-in note</div>
                <div>
                  {airport.checkinNote ||
                    airport.genericGuidance ||
                    "Confirm terminal, gate, and check-in details with your airline before leaving."}
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="h-[520px]">
              <AirportTerminalMap airportCode={airport.id} />
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold">What PodPaiGo estimates</h2>
          <p className="mt-3 leading-7 text-slate-600">
            For each airport, PodPaiGo can consider drive time, parking duration,
            parking transfer time, shuttle friction, terminal walk estimates,
            security timing, weather exposure, and price confidence. Some
            information may be live or verified, while other information is
            estimated.
          </p>
        </section>
      </div>
    </main>
  );
}
