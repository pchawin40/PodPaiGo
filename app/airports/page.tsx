import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '../components/SiteHeader';
import AirportsDirectory from '../components/AirportsDirectory';
import SectionHeader from '../components/ui/SectionHeader';
import TravelCard from '../components/ui/TravelCard';
import { buildAirportDirectoryRecords } from '../../lib/airports/airportDirectory';
import { getAirportsForDirectory } from '../../lib/airports/supabaseAirports';

export const metadata: Metadata = {
  title: 'Airport Coverage',
  description:
    'Airport trip mode pages for comparing airport parking, rideshare, transit, timing, weather, TSA context, and trip stress.',
};

export default async function AirportsPage() {
  const entries = await getAirportsForDirectory();
  const airports = buildAirportDirectoryRecords(entries);

  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <SectionHeader
          title="Airport coverage"
          description="Airport trip mode is one part of PodPaiGo. Browse U.S. and Canada airports, search by city or code, and open planner pages with parking, rideshare, transit, TSA/checklist context, and airport-day guidance."
        />

        <TravelCard className="mt-8">
          <h2 className="text-2xl font-semibold text-foreground">Planning a non-airport trip?</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            For downtown, event, errands, pickups, drop-offs, and general point-to-point destinations,
            use Quick Go or Plan a trip from any origin to any destination.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/quick-go"
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Try Quick Go
            </Link>
            <Link
              href="/trip"
              className="inline-flex items-center justify-center rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Plan any trip
            </Link>
          </div>
        </TravelCard>

        <AirportsDirectory airports={airports} />

        <TravelCard className="mt-10">
          <h2 className="text-2xl font-semibold text-foreground">Expansion plan</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Future airport pages can use the same decision framework: timing, total cost, walking burden,
            weather exposure, route confidence, availability risk, and overall trip stress. Non-airport
            city coverage expands through Quick Go, destination parking inventory, and city street-parking
            rule modules.
          </p>
        </TravelCard>
      </div>
    </main>
  );
}
