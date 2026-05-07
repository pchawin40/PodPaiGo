import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import { getAirportsForDirectory } from "../../lib/airports/supabaseAirports";

export const metadata: Metadata = {
  title: "Airports",
  description:
    "Airport planning pages for comparing parking, rideshare, transit, timing, weather, and trip stress.",
};

function airportHref(code: string) {
  return `/airports/${code.toLowerCase()}`;
}

function statusLabel(status?: string | null) {
  if (!status) return "Planned";
  return status;
}

export default async function AirportsPage() {
  const airports = await getAirportsForDirectory();

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-6 py-16">
        <section>
          <h1 className="text-4xl font-bold tracking-tight">
            Airport planning pages
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            PodPaiGo is designed to compare airport parking, rideshare, and
            transit across airports. Each airport can have its own routing,
            parking, weather, timing, and confidence signals.
          </p>
        </section>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {airports.map((airport) => (
            <Link
              key={airport.id}
              href={airportHref(airport.code)}
              className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
                    {airport.code}
                  </div>

                  <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-950 group-hover:text-blue-700">
                    {airport.name}
                  </h2>

                  {(airport.city || airport.state) && (
                    <p className="mt-2 text-sm text-slate-500">
                      {[airport.city, airport.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>

                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold capitalize text-slate-600">
                  {statusLabel(airport.status)}
                </span>
              </div>

              {airport.description && (
                <p className="mt-5 text-sm leading-6 text-slate-600">
                  {airport.description}
                </p>
              )}

              <div className="mt-6 text-sm font-semibold text-blue-700">
                View airport planner →
              </div>
            </Link>
          ))}
        </div>

        <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">Expansion plan</h2>
          <p className="mt-3 leading-7 text-slate-600">
            Future airport pages can use the same decision framework: timing,
            total cost, walking burden, weather exposure, route confidence,
            availability risk, and overall trip stress.
          </p>
        </section>
      </div>
    </main>
  );
}