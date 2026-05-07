import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Privacy",
  description: "PodPaiGo privacy overview.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <SiteHeader/>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm font-medium text-blue-700">
          ← Back to home
        </Link>

        <h1 className="mt-8 text-4xl font-bold tracking-tight">Privacy</h1>

        <div className="mt-8 space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <section>
            <h2 className="text-xl font-semibold">Early draft privacy note</h2>
            <p className="mt-2 leading-7 text-slate-600">
              PodPaiGo is currently an early planning tool. The app uses trip
              details such as origin, destination, airport, trip time, and
              transportation preferences to generate recommendations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">What may be used</h2>
            <p className="mt-2 leading-7 text-slate-600">
              Trip inputs may be used to request route, weather, parking,
              rideshare, transit, or airport-related information from connected
              services when available.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">No account system yet</h2>
            <p className="mt-2 leading-7 text-slate-600">
              This first draft does not require a PodPaiGo account. Personalized
              memory and saved traveler preferences are not part of this version.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Confirm important details</h2>
            <p className="mt-2 leading-7 text-slate-600">
              Prices, availability, traffic, weather, TSA estimates, shuttle
              timing, and transit details may change. Confirm important details
              directly with the relevant provider.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}