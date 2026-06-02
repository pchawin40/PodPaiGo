import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'PodPaiGo pricing overview for free airport planning and future Pro features.',
};

const freeFeatures = [
  'Airport trip planning and mode comparison',
  'Leave-by timing with airport buffers',
  'Cached parking comparison and provider links',
  'AI trip assistant review flow (mock by default in local dev)',
  'Account sign-in and saved trips',
];

const futureProFeatures = [
  'Price alerts for parking and airport access',
  'Saved frequent trips and faster reopen flows',
  'Flight delay leave-time updates',
  'Calendar sync for airport departures and returns',
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-6 py-14">
        <Link href="/" className="text-sm font-medium text-blue-700">
          ← Back to home
        </Link>

        <section className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Pricing</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Free now. Pro later.</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            PodPaiGo is free for airport trip planning today. Payment integration is not live yet,
            but the product is structured for future partner links and optional Pro features.
          </p>
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold">Free</h2>
            <p className="mt-2 text-sm text-slate-600">Available now</p>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
              {freeFeatures.map((feature) => (
                <li key={feature} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  {feature}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-3xl border border-blue-200 bg-blue-50/40 p-6 shadow-sm">
            <h2 className="text-2xl font-semibold">Future Pro</h2>
            <p className="mt-2 text-sm text-slate-600">Planned — no billing yet</p>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
              {futureProFeatures.map((feature) => (
                <li key={feature} className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                  {feature}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-slate-600">
              Stripe subscriptions are not enabled yet. This page is a product placeholder only.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
