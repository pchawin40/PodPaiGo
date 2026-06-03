import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import PrimaryButton from '../components/ui/PrimaryButton';
import SectionHeader from '../components/ui/SectionHeader';
import TravelCard from '../components/ui/TravelCard';

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
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          ← Back to home
        </Link>

        <SectionHeader
          eyebrow="Pricing"
          title="Free now. Pro later."
          description="PodPaiGo is free for airport trip planning today. Payment integration is not live yet, but the product is structured for future partner links and optional Pro features."
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

        <PrimaryButton href="/trip" className="mt-10">
          Plan a trip
        </PrimaryButton>
      </div>
    </main>
  );
}
