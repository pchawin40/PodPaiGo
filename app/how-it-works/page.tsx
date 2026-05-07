import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "How PodPaiGo compares airport parking, rideshare, and transit using timing, cost, weather, walking burden, and stress signals.",
};

const signals = [
  {
    title: "Timing",
    body: "PodPaiGo looks at trip time, route duration, airport buffer, TSA estimate, and parking or transfer time.",
  },
  {
    title: "Cost",
    body: "Options are compared using estimated total trip cost, not just the visible parking or fare number.",
  },
  {
    title: "Walking burden",
    body: "The app considers walking, shuttle transfer, checkpoint walk, and whether checked bags may make the option harder.",
  },
  {
    title: "Weather",
    body: "Weather can make covered parking, shorter walks, and lower-transfer options more attractive.",
  },
  {
    title: "Stress",
    body: "Stress is an estimated score based on route confidence, walking burden, rush hour, weather, availability, and shuttle friction.",
  },
  {
    title: "Confidence",
    body: "Data is labeled as live, verified source, estimated, fallback, or unavailable so travelers know what to trust.",
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
            PodPaiGo compares airport transportation options by combining
            practical signals travelers actually care about: leave time, total
            cost, luggage effort, weather exposure, route confidence, shuttle
            friction, and overall trip stress.
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
            The current draft may have deeper support for some airports than others. 
            Some prices, availability, shuttle times, traffic, weather, and TSA estimates
            can change. Always confirm critical details with the parking provider, airline, 
            airport, or transportation provider before relying on them.
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