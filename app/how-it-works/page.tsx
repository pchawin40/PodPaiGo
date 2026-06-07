import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "How PodPaiGo compares drive time, destination parking, street or meter rules, rideshare, transit, airport-day details, and backup options.",
};

const signals = [
  {
    title: "Timing",
    body: "PodPaiGo looks at trip time, route duration, leave-by timing, parking or transfer time, and airport buffers or TSA estimates when the trip involves a flight.",
  },
  {
    title: "Cost",
    body: "Options are compared using estimated total trip cost, not just the visible parking, fare, or garage number.",
  },
  {
    title: "Parking fit",
    body: "Airport trips can include airport lots and shuttle friction. City trips can include garages, lots, street or meter outlook, and Park & Ride backups.",
  },
  {
    title: "Rideshare and transit",
    body: "Rideshare, taxi, transit, and park-and-ride options are compared when they are relevant to the trip and available in the data.",
  },
  {
    title: "Stress",
    body: "Stress is an estimated score based on route confidence, walking burden, rush hour, weather, availability, transfers, and shuttle friction.",
  },
  {
    title: "Confidence",
    body: "Data is labeled as live, verified source, cached, estimated, fallback, or unavailable so travelers know what to trust.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <SiteHeader/>
      <div className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/" className="text-sm font-medium text-blue-700">
          ← Back to home
        </Link>

        <div className="mt-8 max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight">How it works</h1>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            PodPaiGo compares the actual trip decision: drive time, destination parking,
            street or meter rules, rideshare, transit, backups, and airport-day details
            when a flight is involved.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {signals.map((signal) => (
            <section
              key={signal.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold">{signal.title}</h2>
              <p className="mt-2 leading-7 text-slate-600">{signal.body}</p>
            </section>
          ))}
        </div>

        <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">Important note</h2>
          <p className="mt-3 leading-7 text-slate-600">
            The current draft may have deeper support for some airports and cities than others.
            Some prices, availability, shuttle times, traffic, weather, and TSA estimates can
            change. Street parking rules vary by block, posted signs always win, and live
            refreshes may be rate-limited. Always confirm critical details with the parking
            provider, posted sign, airline, airport, or transportation provider before relying
            on them.
          </p>
        </section>

        <Link
          href="/trip"
          className="mt-8 inline-flex rounded-full bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Try the planner
        </Link>
      </div>
    </main>
  );
}
