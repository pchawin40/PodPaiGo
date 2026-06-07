import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import PrimaryButton from '../components/ui/PrimaryButton';
import SectionHeader from '../components/ui/SectionHeader';
import TravelCard from '../components/ui/TravelCard';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Learn what PodPaiGo is building for airport trips, city parking, rideshare, transit, timing, and travel confidence.',
};

export default function AboutPage() {
  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          ← Back to home
        </Link>

        <SectionHeader title="About PodPaiGo" className="mt-8" />

        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          PodPaiGo helps people decide how to get there - not just where to park. Airport trips
          are the first deep use case, but the same decision engine also works for downtown trips,
          events, errands, pickups, and point-to-point travel.
        </p>

        <TravelCard className="mt-10 space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-foreground">Why it exists</h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              Trip planning is fragmented. Parking sites, map apps, transit apps, rideshare apps,
              airport pages, and weather forecasts all answer different parts of the same question.
              PodPaiGo brings those signals together so travelers can make a clearer choice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">What it focuses on</h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              Airport trips cover airport parking, leave-by timing, TSA/checklist details, rideshare,
              transit, and airport companion context. City and destination trips cover drive time,
              garages and lots, street or meter parking outlook, rideshare, transit, and Park & Ride
              backups where available.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Trust model</h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              PodPaiGo is an early draft. Some data may be live or verified, while other details are
              estimated, cached, or used as fallback logic. Street parking rules vary by block,
              posted signs always win, and provider prices or availability should be verified before
              you park or travel.
            </p>
          </section>
        </TravelCard>

        <PrimaryButton href="/trip" className="mt-8">
          Plan a trip
        </PrimaryButton>
      </div>
    </main>
  );
}
