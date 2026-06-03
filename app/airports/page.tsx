import type { Metadata } from 'next';
import SiteHeader from '../components/SiteHeader';
import AirportsDirectory from '../components/AirportsDirectory';
import SectionHeader from '../components/ui/SectionHeader';
import TravelCard from '../components/ui/TravelCard';
import { buildAirportDirectoryRecords } from '../../lib/airports/airportDirectory';
import { getAirportsForDirectory } from '../../lib/airports/supabaseAirports';

export const metadata: Metadata = {
  title: 'Airports',
  description:
    'Airport planning pages for comparing parking, rideshare, transit, timing, weather, and trip stress.',
};

export default async function AirportsPage() {
  const entries = await getAirportsForDirectory();
  const airports = buildAirportDirectoryRecords(entries);

  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />

      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <SectionHeader
          title="Airport planning pages"
          description="Browse U.S. and Canada airports, search by city or code, and open planner pages with parking, rideshare, transit, and airport-day guidance."
        />

        <AirportsDirectory airports={airports} />

        <TravelCard className="mt-10">
          <h2 className="text-2xl font-semibold text-foreground">Expansion plan</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Future airport pages can use the same decision framework: timing, total cost, walking burden,
            weather exposure, route confidence, availability risk, and overall trip stress.
          </p>
        </TravelCard>
      </div>
    </main>
  );
}
