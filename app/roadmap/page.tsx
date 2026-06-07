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
    title: 'Now',
    items: [
      'Airport trip planner with parking, rideshare, taxi, transit, leave-by timing, TSA/checklist context, and airport guidance',
      'Quick Go city trips for point-to-point drive time, destination parking, rideshare, transit, and Park & Ride backups',
      'Destination parking cards for garages and lots',
      'Street/meter parking outlook with explicit Seattle Sunday, holiday, evening, and event-zone warnings',
      'Cached parking fallback when live refresh is paused or budget-limited',
      'Account sign-in, saved trips, provider CTAs, and confidence labels for live, verified, cached, estimated, and fallback data',
    ],
  },
  {
    title: 'Next',
    items: [
      'Supabase destination parking inventory near any destination coordinates',
      'More U.S. city street parking rule modules beyond Seattle',
      'Event parking warnings for major venues and special districts',
      'Better Park & Ride ranking for city trips and airport access',
      'Weather forecast reliability for city/general trips',
      'Better rideshare deep links and clearer live-price fallback states',
    ],
  },
  {
    title: 'Later',
    items: [
      'Saved places, saved preferences, favorite trips, and favorite parking lots',
      'Calendar integrations for flights, returns, events, errands, and recurring trips',
      'Flight tracking auto-adjust and price/availability alerts',
      'User-submitted parking notes and validation signals',
      'More airports, more city coverage, and a native mobile app',
      'Business traveler mode and richer hotel/flight integrations',
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
          title="What PodPaiGo has now and what comes next"
          description="PodPaiGo helps travelers compare airport trips and city parking choices: drive time, destination garages/lots, street or meter outlook, rideshare, transit, Park & Ride backups, timing, cost, weather, and trip effort."
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
          <h2 className="text-2xl font-semibold text-foreground">Data policy direction</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            PodPaiGo will keep labeling estimates, cached options, provider errors, and live-refresh
            limits. Street parking rules vary by city and block, so posted signs and provider rules
            remain the final source of truth.
          </p>
        </TravelCard>

        <PrimaryButton href="/trip" className="mt-10">
          Open planner
        </PrimaryButton>
      </div>
    </main>
  );
}
