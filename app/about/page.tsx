import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import PrimaryButton from '../components/ui/PrimaryButton';
import SectionHeader from '../components/ui/SectionHeader';
import TravelCard from '../components/ui/TravelCard';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Learn what PodPaiGo is building for airport parking, rideshare, transit, timing, and travel confidence.',
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
          PodPaiGo is an airport trip decision engine. It helps travelers compare parking, rideshare, and
          transit with the practical details that usually get missed: when to leave, how much the trip may
          cost, how much walking is involved, whether weather changes the best choice, and how stressful the
          option may feel.
        </p>

        <TravelCard className="mt-10 space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-foreground">Why it exists</h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              Airport planning is fragmented. Parking sites, map apps, transit apps, rideshare apps, airport
              pages, and weather forecasts all answer different parts of the same question. PodPaiGo brings
              those signals together so travelers can make a clearer choice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">What it focuses on</h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              The first public draft focuses on a primary airport while the product framework is designed to
              expand to more airports.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Current stage</h2>
            <p className="mt-2 leading-7 text-muted-foreground">
              PodPaiGo is an early draft. Some data may be live or verified, while other details are
              estimated or used as fallback logic. The goal is to make those differences clear.
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
