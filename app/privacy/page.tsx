import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How PodPaiGo handles account data, saved trips, OAuth, API usage, and third-party services.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/" className="text-sm font-medium text-blue-700">
          ← Back to home
        </Link>

        <h1 className="mt-8 text-4xl font-bold tracking-tight">Privacy</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
          PodPaiGo is an airport planning tool. This page describes what data the
          app uses today and how it is handled.
        </p>

        <div className="mt-8 space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <section>
            <h2 className="text-xl font-semibold">Trip planning data</h2>
            <p className="mt-2 leading-7 text-slate-600">
              When you plan a trip, PodPaiGo uses inputs such as origin,
              destination, airport, dates, transportation preferences, and timing
              choices to generate recommendations. Trip details may be sent to
              connected services for routes, weather, parking, rideshare, transit,
              or airport-related information when those features are enabled.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Account, email, and profile data</h2>
            <p className="mt-2 leading-7 text-slate-600">
              If you create an account, PodPaiGo stores account information through
              Supabase Auth. That may include your email address, display name, and
              profile photo metadata returned by your sign-in provider. Account data
              is used to identify you, protect your saved content, and keep you
              signed in across sessions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Saved trip data</h2>
            <p className="mt-2 leading-7 text-slate-600">
              When you save a trip while signed in, PodPaiGo stores the trip payload
              you chose to save so you can reopen it later from your account page.
              Saved trips are associated with your user account and protected by
              database access rules.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">OAuth via Supabase and Google</h2>
            <p className="mt-2 leading-7 text-slate-600">
              Google sign-in is handled by Supabase Auth, not directly by PodPaiGo.
              When you choose Google sign-in, Google and Supabase process the OAuth
              exchange. PodPaiGo receives the authenticated session and basic profile
              fields needed for your account experience. See{" "}
              <code className="rounded bg-slate-100 px-1">docs/supabase-oauth-setup.md</code>{" "}
              for setup details.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">API usage, caching, and safe mode</h2>
            <p className="mt-2 leading-7 text-slate-600">
              PodPaiGo may cache route, parking, places, and usage data to reduce
              repeated external API calls and control cost. Local development defaults
              include safe-mode quota protection and disabled Google Places / live
              parking discovery unless you explicitly enable them. API usage counters
              and cached snapshots help the app avoid unnecessary paid requests.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Google Maps and Google Places</h2>
            <p className="mt-2 leading-7 text-slate-600">
              Some features can use Google Maps or Google Places when configured and
              enabled. In local development, Google Places and related live discovery
              are disabled by default. When enabled, trip and airport search inputs may
              be sent to Google services according to your environment configuration.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">AI trip assistant</h2>
            <p className="mt-2 leading-7 text-slate-600">
              The AI trip assistant can run in mock mode by default. If a live AI
              provider is configured in the future, trip text you submit for parsing
              would be sent only to the configured provider for that feature.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">What we do not do</h2>
            <p className="mt-2 leading-7 text-slate-600">
              PodPaiGo does not sell your personal data. We do not use your account
              or saved-trip information for advertising resale. Do not store secrets,
              payment card numbers, or passport numbers in saved trips.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Confirm important details</h2>
            <p className="mt-2 leading-7 text-slate-600">
              Prices, availability, traffic, weather, TSA estimates, shuttle timing,
              and transit details may change. Confirm important details directly with
              your airline, parking provider, or transportation service before travel.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
