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

        <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            What the name means
          </p>
          <p className="mt-2 text-lg leading-8 text-foreground">
            PodPaiGo comes from <span className="font-semibold">ปลอดภัย Go</span> — a Thai-English
            phrase that means <span className="font-semibold">&quot;go safely.&quot;</span>
          </p>
          <p className="mt-2 leading-7 text-muted-foreground">
            Before you leave, you should feel confident about how you&apos;re getting there, where
            you&apos;ll park, what it might cost, and what to watch out for.
          </p>
        </div>

        <TravelCard className="mt-8 space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-foreground">Why it exists</h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              Trip planning is fragmented. Parking sites, map apps, transit apps, rideshare apps,
              airport pages, and weather forecasts all answer different parts of the same question.
              PodPaiGo brings those signals together so travelers can make a clearer choice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">What we believe</h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              PodPaiGo compares route time, parking, transit, rideshare, airport options, weather,
              and local parking rules in one place. It is not just about finding the cheapest
              option — it is about helping you make a safer, clearer, less stressful trip decision
              before you go.
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
              PodPaiGo is in public beta. Some data is live or provider-linked, while other details
              are estimated, cached, or shown as fallback guidance. Street parking rules vary by
              block, posted signs always win, and provider prices or availability should be verified
              before you park or travel.
            </p>
          </section>
        </TravelCard>

        <PrimaryButton href="/trip" className="mt-8">
          Plan trip
        </PrimaryButton>
      </div>
    </main>
  );
}
