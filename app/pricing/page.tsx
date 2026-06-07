import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import PrimaryButton from '../components/ui/PrimaryButton';
import SectionHeader from '../components/ui/SectionHeader';
import TravelCard from '../components/ui/TravelCard';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'PodPaiGo pricing overview for free airport trip planning, city trip comparisons, and future Pro features.',
};

const freeFeatures = [
  'Airport trip planning with leave-by timing, TSA/checklist context, parking, rideshare, and transit',
  'Point-to-point trip comparisons for city, downtown, event, and general destinations',
  'Destination parking suggestions with garages, lots, provider links, and directions',
  'Street/meter parking outlook where supported',
  'Cached parking fallback when live refresh is paused or rate-limited',
  'Account sign-in and saved trips',
];

const futureProFeatures = [
  'Price and availability alerts for parking and airport access',
  'Saved frequent trips, saved places, and faster reopen flows',
  'Flight delay and event timing updates',
  'Calendar sync for airport departures, returns, events, and city trips',
];

export default function PricingPage() {
  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          ← Back to home
        </Link>

        <SectionHeader
          eyebrow="Pricing"
          title="Free now. Pro later."
          description="PodPaiGo is free for airport trips and point-to-point trip comparisons today. Payment integration is not live yet, but the product is structured for future partner links and optional Pro features."
          className="mt-8"
        />

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <TravelCard>
            <h2 className="text-2xl font-semibold text-foreground">Free</h2>
            <p className="mt-2 text-sm text-muted-foreground">Available now</p>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
              {freeFeatures.map((feature) => (
                <li key={feature} className="rounded-2xl border border-border bg-muted/60 px-4 py-3">
                  {feature}
                </li>
              ))}
            </ul>
          </TravelCard>

          <TravelCard className="border-primary/20 bg-primary/5">
            <h2 className="text-2xl font-semibold text-foreground">Future Pro</h2>
            <p className="mt-2 text-sm text-muted-foreground">Planned — no billing yet</p>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
              {futureProFeatures.map((feature) => (
                <li key={feature} className="rounded-2xl border border-border bg-card px-4 py-3">
                  {feature}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-muted-foreground">
              Stripe subscriptions are not enabled yet. This page is a product placeholder only.
            </p>
          </TravelCard>
        </section>

        <TravelCard className="mt-6">
          <h2 className="text-xl font-semibold text-foreground">Data transparency</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Some prices and availability are estimates. Street parking rules vary by block,
            posted signs always win, and live data may be rate-limited. When live refresh is
            paused, PodPaiGo may show cached or saved parking options with provider and directions
            links so you can verify price and availability.
          </p>
        </TravelCard>

        <PrimaryButton href="/trip" className="mt-10">
          Plan a trip
        </PrimaryButton>
      </div>
    </main>
  );
}
