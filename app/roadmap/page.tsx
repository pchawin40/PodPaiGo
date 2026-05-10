import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Current Features and Roadmap",
  description:
    "What PodPaiGo currently supports and the planned roadmap for Washington airports, national airport coverage, point-to-point planning, and saved preferences.",
};

const currentFeatures = [
  "Airport trip planning for supported Washington airports",
  "Parking, rideshare, taxi, and transit comparison where data is available",
  "Leave-by timing using traffic, airport buffer, and trip details",
  "Parking duration and total-cost estimates",
  "Airport maps and airport-specific guidance",
  "Weather-aware scoring for parking comfort and walking exposure",
  "Confidence labels for live, verified, estimated, and fallback data",
];

const futurePlans = [
  {
    title: "Washington airport coverage",
    body: "Expand airport planning across Washington first, with better maps, terminal notes, parking sources, transit options, and airport-specific rules.",
  },
  {
    title: "National airport coverage",
    body: "Move from Washington airports to major U.S. airports, then broaden coverage as the data model and provider links become more reliable.",
  },
  {
    title: "Point A to point B planning",
    body: "Grow beyond airport-only trips so users can compare transportation choices for general destinations, not just airport arrivals and departures.",
  },
  {
    title: "Saved preferences",
    body: "Let users save what they care about, such as lower cost, covered parking, fewer transfers, shorter walks, rideshare preference, luggage needs, and typical departure buffers.",
  },
];

export default function RoadmapPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-6 py-14">
        <Link href="/" className="text-sm font-medium text-blue-700">
          ← Back to home
        </Link>

        <section className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Product status
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">
            What PodPaiGo has now and what comes next
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            PodPaiGo is currently focused on airport transportation planning:
            comparing parking, rideshare, transit, timing, cost, weather, and
            trip effort. The roadmap expands from Washington airports to broader
            U.S. airport coverage, then to general point-to-point planning.
          </p>
        </section>

        <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">Implemented now</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {currentFeatures.map((feature) => (
              <div
                key={feature}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700"
              >
                {feature}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold">Future implementation</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {futurePlans.map((plan) => (
              <article
                key={plan.title}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-semibold">{plan.title}</h3>
                <p className="mt-3 leading-7 text-slate-600">{plan.body}</p>
              </article>
            ))}
          </div>
        </section>

        <Link
          href="/trip"
          className="mt-10 inline-flex rounded-full bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Open planner
        </Link>
      </div>
    </main>
  );
}
