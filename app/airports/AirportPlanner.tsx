import Link from 'next/link';
import AirportTerminalMap from '../results/AirportTerminalMap';
import type { AirportInfo } from '../../lib/airports/catalog';
import PrimaryButton from '../components/ui/PrimaryButton';
import SectionHeader from '../components/ui/SectionHeader';
import TravelCard from '../components/ui/TravelCard';

const plannerSignals = [
  'Parking and off-airport parking comparison',
  'Rideshare, taxi, and transit comparison',
  'Leave-by timing for departures',
  'Weather-aware parking preferences',
  'Walking burden and luggage effort estimates',
  'Price confidence and provider links',
];

function airportTripHref(airport: AirportInfo) {
  const params = new URLSearchParams({
    airport: airport.id,
    destination: airport.routingAddress,
  });

  return `/trip?${params.toString()}`;
}

function airportMapHref(airport: AirportInfo) {
  return (
    airport.indoorMap?.url ||
    airport.airportMap?.url ||
    airport.officialAirportUrl ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      airport.routingAddress,
    )}`
  );
}

export default function AirportPlanner({ airport }: { airport: AirportInfo }) {
  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <Link href="/airports" className="text-sm font-medium text-primary hover:underline">
          ← Back to airports
        </Link>

        <TravelCard className="mt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                {airport.id} airport planning guide
              </p>

              <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
                {airport.label} trip planner
              </h1>
            </div>

            <span className="inline-flex w-fit rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Airport planner
            </span>
          </div>

          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            Compare ways to get to {airport.destinationName}, including parking, rideshare, taxi,
            and transit options where available. PodPaiGo uses timing, cost, walking burden, weather
            exposure, route confidence, and airport-specific guidance to help plan the trip.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {plannerSignals.map((feature) => (
              <div
                key={feature}
                className="rounded-2xl border border-border bg-muted/60 p-4 text-sm text-muted-foreground"
              >
                {feature}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryButton href={airportTripHref(airport)}>Plan a trip to {airport.id}</PrimaryButton>

            {airportMapHref(airport) && (
              <PrimaryButton href={airportMapHref(airport)} variant="secondary">
                Airport map
              </PrimaryButton>
            )}
          </div>
        </TravelCard>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <TravelCard>
            <h2 className="text-2xl font-semibold text-foreground">Airport guidance</h2>

            <div className="mt-4 space-y-4 text-sm leading-6 text-muted-foreground">
              <div>
                <div className="font-semibold text-foreground">Arrive at</div>
                <div>{airport.routingAddress}</div>
              </div>

              <div>
                <div className="font-semibold text-foreground">Rideshare/taxi destination</div>
                <div>{airport.rideshareDestinationName}</div>
              </div>

              <div>
                <div className="font-semibold text-foreground">Check-in note</div>
                <div>
                  {airport.checkinNote ||
                    airport.genericGuidance ||
                    'Confirm terminal, gate, and check-in details with your airline before leaving.'}
                </div>
              </div>
            </div>
          </TravelCard>

          <TravelCard padding="none" className="overflow-hidden">
            <div className="h-[520px]">
              <AirportTerminalMap airportCode={airport.id} />
            </div>
          </TravelCard>
        </section>

        <TravelCard className="mt-8">
          <SectionHeader
            title="What PodPaiGo estimates"
            description="For each airport, PodPaiGo can consider drive time, parking duration, parking transfer time, shuttle friction, terminal walk estimates, security timing, weather exposure, and price confidence. Some information may be live or verified, while other information is estimated."
          />
        </TravelCard>
      </div>
    </main>
  );
}
