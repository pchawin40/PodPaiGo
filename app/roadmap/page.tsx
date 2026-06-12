import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import PrimaryButton from '../components/ui/PrimaryButton';
import SectionHeader from '../components/ui/SectionHeader';
import TravelCard from '../components/ui/TravelCard';

export const metadata: Metadata = {
  title: 'Current Features and Roadmap',
  description:
    'What PodPaiGo currently supports and the planned roadmap for airport trips, city parking, accounts, AI assistance, and broader travel coverage.',
};

const roadmapGroups = [
  {
    title: 'Available now',
    items: [
      'Airport trips: when to leave, parking, rideshare, transit, and TSA timing',
      'City trips: drive time, garages and lots, and the street/meter outlook',
      'Rideshare, transit, and Park & Ride compared side by side',
      'Saved trips and an account to come back to',
      'Clear labels for live, saved, and estimated data',
    ],
  },
  {
    title: 'Coming next',
    items: [
      'Parking coverage near more destinations and more cities',
      'Event and stadium trip warnings for signs, crowds, towing, and safer parking choices',
      'More reliable weather for city trips',
      'Better rideshare and transit links',
    ],
  },
  {
    title: 'Later on',
    items: [
      'Saved places, favorite trips, and favorite lots',
      'Calendar sync and price or availability alerts',
      'Flight tracking that adjusts your timing automatically',
      'More airports, more cities, and a mobile app',
    ],
  },
];

export default function RoadmapPage() {
  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          ← Back to home
        </Link>

        <SectionHeader
          eyebrow="Product status"
          title="What works today, and what's coming"
          description="PodPaiGo is in public beta. Here's an honest look at what you can use right now and what we're building next."
          className="mt-8"
        />

        <section className="mt-10 grid gap-6 lg:grid-cols-3">
          {roadmapGroups.map((group) => (
            <TravelCard key={group.title}>
              <h2 className="text-2xl font-semibold text-foreground">{group.title}</h2>
              <div className="mt-5 space-y-3">
                {group.items.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-border bg-muted/60 p-4 text-sm leading-6 text-muted-foreground"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </TravelCard>
          ))}
        </section>

        <TravelCard className="mt-8">
          <h2 className="text-2xl font-semibold text-foreground">Our promise on data</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            We'll always tell you what's live, saved, or estimated — and never hide it. Street
            parking rules change block by block, so posted signs and the provider are still the
            final word before you park.
          </p>
        </TravelCard>

        <PrimaryButton href="/trip" className="mt-10">
          Open planner
        </PrimaryButton>
      </div>
    </main>
  );
}
