import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import PrimaryButton from '../components/ui/PrimaryButton';
import SectionHeader from '../components/ui/SectionHeader';
import TravelCard from '../components/ui/TravelCard';
import {
  DATA_TRANSPARENCY_DISCLOSURE,
  PRICING_BETA_BILLING_NOTE,
  PRICING_BETA_FREE_HEADLINE,
  PRICING_DATA_HONESTY_NOTE,
} from '../../lib/marketing/publicCopy';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'PodPaiGo is free during beta. Compare airport and city trip planning, parking, transit, and rideshare options with honest live, estimated, and cached data labels.',
};

const betaFeatures = [
  'Quick Go trip planning',
  'Airport trip planning with leave-by timing, TSA/checklist context, and airport guidance',
  'City, downtown, and event trip comparisons',
  'Parking, transit, rideshare, and route-time comparison',
  'Weather and timing context where available',
  'Provider links, directions, and outbound click tracking for partner readiness',
  'Account sign-in and saved trips',
];

const plannedLaterFeatures = [
  'Saved frequent trips and faster reopen flows',
  'Price and availability alerts',
  'Calendar sync for flights, returns, events, and city trips',
  'Flight and event timing updates',
  'Advanced commute and airport planning tools',
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
          title="Free during beta"
          description={`${PRICING_BETA_FREE_HEADLINE} ${PRICING_BETA_BILLING_NOTE}`}
          className="mt-8"
        />

        <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
          {PRICING_DATA_HONESTY_NOTE}
        </p>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <TravelCard>
            <h2 className="text-2xl font-semibold text-foreground">Free Beta</h2>
            <p className="mt-2 text-sm text-muted-foreground">Available now</p>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
              {betaFeatures.map((feature) => (
                <li key={feature} className="rounded-2xl border border-border bg-muted/60 px-4 py-3">
                  {feature}
                </li>
              ))}
            </ul>
          </TravelCard>

          <TravelCard className="border-primary/20 bg-primary/5">
            <h2 className="text-2xl font-semibold text-foreground">Planned later</h2>
            <p className="mt-2 text-sm text-muted-foreground">Not available yet — no subscriptions active</p>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
              {plannedLaterFeatures.map((feature) => (
                <li key={feature} className="rounded-2xl border border-border bg-card px-4 py-3">
                  {feature}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-muted-foreground">
              PodPaiGo may introduce optional paid features after beta. Pricing and billing will be
              announced before anything goes live.
            </p>
          </TravelCard>
        </section>

        <TravelCard className="mt-6">
          <h2 className="text-xl font-semibold text-foreground">Data transparency</h2>
          <p className="mt-3 leading-7 text-muted-foreground">{DATA_TRANSPARENCY_DISCLOSURE}</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Live provider pricing is shown when available — for example ParkWhiz live quotes or
            AirportParkingReservations cached/from rates. Marketplace links such as SpotHero open
            provider sites for you to confirm current price and availability. Street and meter
            outlooks are guidance only; posted signs and local rules always win.
          </p>
        </TravelCard>

        <PrimaryButton href="/trip" className="mt-10">
          Plan trip
        </PrimaryButton>
      </div>
    </main>
  );
}
