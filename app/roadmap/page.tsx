import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Current Features and Roadmap",
  description:
    "What PodPaiGo currently supports and the planned roadmap for airport planning, accounts, AI assistance, and broader travel coverage.",
};

const currentFeatures = [
  "National U.S. airport search in trip and edit-trip forms",
  "Airport trip planning with parking, rideshare, taxi, and transit comparison",
  "Leave-by timing using traffic, airport buffer, and trip details",
  "Trip-level transit pricing when a return leg is implied",
  "Parking duration with total and per-day price display",
  "Safe-mode Google API quota protection for local development",
  "Google Places and live parking discovery disabled by default in local dev",
  "Supabase account foundation with email/password and Google sign-in",
  "Saved trips on your account page",
  "AI trip assistant in mock mode (confirm before running recommendations)",
  "Airport trip card with airline lookup and airport guidance",
  "Weather-aware scoring for parking comfort and walking exposure",
  "Confidence labels for live, verified, estimated, and fallback data",
];

const futurePlans = [
  {
    title: "Live AI trip assistant providers",
    body: "Move beyond mock parsing to optional live LLM providers with the same confirm-before-search safety flow.",
  },
  {
    title: "More OAuth providers",
    body: "Add Apple and Microsoft sign-in through Supabase Auth once provider setup is complete.",
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
  {
    title: "Favorite trips and saved routes",
    body: "Expand saved-trip workflows with tags, recurring airport routes, and faster reopen flows.",
  },
  {
    title: "Favorite parking lots",
    body: "Bookmark trusted lots and reopen them quickly on future trips to the same airport.",
  },
  {
    title: "Business traveler mode",
    body: "A profile tuned for expensed work travel with faster defaults, clearer receipts-oriented summaries, and fewer leisure-oriented distractions.",
  },
  {
    title: "Hotel and flight integrations (future expansion)",
    body: "Later connect hotel stays and flight details for richer trip context. This is future expansion, not current core PodPaiGo scope.",
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
            PodPaiGo helps travelers compare airport parking, rideshare, transit,
            timing, cost, weather, and trip effort. Recent work added account
            sign-in, saved trips, safe-mode API protection, and an AI trip assistant
            foundation while keeping Google Places disabled by default in local dev.
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
