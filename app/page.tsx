import Link from "next/link";
import HeroBadge from "./components/HeroBadge";

const features = [
  {
    title: "Leave-by timing",
    description:
      "See when to leave based on your flight time, route duration, TSA estimate, parking transfer, and airport buffer.",
  },
  {
    title: "Compare parking, rideshare, and transit",
    description:
      "View your main airport options side-by-side instead of guessing between separate apps and parking sites.",
  },
  {
    title: "Trip stress and luggage effort",
    description:
      "PodPaiGo considers walking burden, shuttle friction, weather exposure, and timing risk.",
  },
  {
    title: "Confidence labels",
    description:
      "Prices and route details are labeled as live, verified, estimated, fallback, or unavailable.",
  },
];

const steps = [
  "Enter your origin and airport trip details.",
  "Choose whether you can drive, rideshare, use transit, or compare everything.",
  "Review timing, cost, stress, weather, and transfer details.",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            PodPaiGo
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <Link href="/how-it-works" className="hover:text-slate-950">
              How it works
            </Link>
            <Link href="/airports" className="hover:text-slate-950">
              Airports
          </Link>
            <Link href="/roadmap" className="hover:text-slate-950">
              Roadmap
            </Link>
            <Link href="/about" className="hover:text-slate-950">
              About
            </Link>
            <Link href="/privacy" className="hover:text-slate-950">
              Privacy
            </Link>
          </nav>

          <Link
            href="/trip"
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Plan trip
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-24">
        <div>
          <HeroBadge />

          <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-slate-950 md:text-6xl">
            Find the easiest way to get to your airport.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            PodPaiGo compares airport parking, rideshare, and transit with
            leave-by timing, estimated total cost, weather impact, walking
            burden, and trip stress in one place.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/trip"
              className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Plan my airport trip
            </Link>

            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 hover:bg-slate-100"
            >
              See how it works
            </Link>
          </div>

          <p className="mt-4 text-sm text-slate-500">
            Live or verified data is used where available, and estimated
            information is clearly labeled.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="rounded-2xl bg-slate-950 p-5 text-white">
            <div className="text-sm text-slate-300">Recommended option</div>
            <div className="mt-2 text-2xl font-bold">Park at SEA Garage</div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between rounded-xl bg-white/10 px-4 py-3">
                <span>Leave by</span>
                <span className="font-semibold">6:42 AM</span>
              </div>
              <div className="flex justify-between rounded-xl bg-white/10 px-4 py-3">
                <span>Trip stress</span>
                <span className="font-semibold">Low</span>
              </div>
              <div className="flex justify-between rounded-xl bg-white/10 px-4 py-3">
                <span>Luggage effort</span>
                <span className="font-semibold">Easy</span>
              </div>
              <div className="flex justify-between rounded-xl bg-white/10 px-4 py-3">
                <span>Price confidence</span>
                <span className="font-semibold">Estimated</span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3 text-sm text-slate-600">
            <div className="rounded-2xl border border-slate-200 p-4">
              Home → Parking → Terminal → TSA
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              Weather and shuttle friction included in ranking.
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 md:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold text-slate-950">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Airport planning should not require five tabs.
            </h2>
            <p className="mt-4 text-slate-600">
              Parking sites show parking. Rideshare apps show rides. Transit
              apps show transit. PodPaiGo helps you compare the actual airport
              decision: what is easiest, cheapest, fastest, and least stressful
              for this specific trip?
            </p>
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <div
                key={step}
                className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-slate-700">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <div>© {new Date().getFullYear()} PodPaiGo</div>
        <div className="flex gap-5">
          <Link href="/about" className="hover:text-slate-900">
            About
          </Link>
          <Link href="/how-it-works" className="hover:text-slate-900">
            How it works
          </Link>
          <Link href="/privacy" className="hover:text-slate-900">
            Privacy
          </Link>
        </div>
      </footer>
    </main>
  );
}