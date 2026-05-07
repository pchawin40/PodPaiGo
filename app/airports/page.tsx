import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Airports",
  description:
    "Airport planning pages for comparing parking, rideshare, transit, timing, weather, and trip stress.",
};

const airports = [
  {
    code: "SEA",
    name: "Seattle-Tacoma International Airport",
    status: "Primary draft airport",
    href: "/airports/sea",
  },
];

export default function AirportsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <SiteHeader/>
      <div className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/" className="text-sm font-medium text-blue-700">
          ← Back to home
        </Link>

        <section className="mt-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Airport planning pages
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            PodPaiGo is designed to compare airport parking, rideshare, and
            transit across airports. The first public draft focuses on one
            primary airport while the system is built to expand.
          </p>
        </section>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {airports.map((airport) => (
            <Link
              key={airport.code}
              href={airport.href}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:bg-slate-50"
            >
              <div className="text-sm font-semibold text-blue-700">
                {airport.code}
              </div>
              <h2 className="mt-2 text-2xl font-bold">{airport.name}</h2>
              <p className="mt-3 text-sm text-slate-600">{airport.status}</p>
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