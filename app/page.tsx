import Link from 'next/link';
import HeroBadge from './components/HeroBadge';
import PodPaiGoAssistant from './components/PodPaiGoAssistant';
import SavedTripsHomeSection from './components/SavedTripsHomeSection';
import SiteHeader from './components/SiteHeader';
import TripAssistantPanel from './components/TripAssistantPanel';
import QuickGoPanel from './components/QuickGoPanel';
import GlassPanel from './components/ui/GlassPanel';
import PrimaryButton from './components/ui/PrimaryButton';
import SectionHeader from './components/ui/SectionHeader';
import StatusPill from './components/ui/StatusPill';
import TravelCard from './components/ui/TravelCard';
import HomeAnalytics from './components/HomeAnalytics';

const featureChips = [
  'Airport trips',
  'Destination parking',
  'Street/meter outlook',
  'Rideshare vs transit',
  'Park & Ride backups',
  'Saved trips',
];

const features = [
  {
    title: 'Airport trip planning',
    description:
      'Compare airport parking, leave-by timing, TSA/checklist details, terminal guidance, rideshare, and transit in one view.',
  },
  {
    title: 'City and destination parking',
    description:
      'Check drive time, destination garages and lots, street or meter parking outlook, and backup options for downtown, event, and general trips.',
  },
  {
    title: 'Rideshare, transit, and backups',
    description:
      'Review rideshare, transit, and Park & Ride alternatives when driving or parking does not look like the best choice.',
  },
  {
    title: 'Confidence labels and fallbacks',
    description:
      'Prices, availability, routes, street rules, and cached parking options are labeled so you know what is live, estimated, saved, or unavailable.',
  },
];

const steps = [
  'Enter where you are going - airport, garage, event, downtown, or any destination.',
  'Choose whether you can drive, rideshare, use transit, or compare everything.',
  'Review timing, cost, stress, parking outlook, weather, and backup options.',
];

export default function Home() {
  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <HomeAnalytics />
      <SiteHeader />

      <section className="travel-atmosphere scroll-mt-20 mx-auto max-w-6xl rounded-[2rem] px-4 py-10 sm:px-6 md:py-16 md:pb-12">
        <div className="relative z-10 grid gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center">
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-8 top-24 h-40 w-40 rounded-full bg-travel-sky/12 blur-3xl"
          />
          <HeroBadge />

          <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            Plan airport trips and city parking in one clean dashboard.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            PodPaiGo compares drive time, destination parking, street/meter rules, rideshare,
            transit, and airport-day details so you can choose the easiest, cheapest, fastest,
            or least stressful way to go.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {featureChips.map((chip) => (
              <span key={chip} className="feature-chip">
                {chip}
              </span>
            ))}
          </div>

          <div className="relative mt-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-6 bottom-0 h-28 w-40 rounded-full bg-travel-amber/10 blur-3xl"
            />
            <div className="relative flex flex-col gap-3 sm:flex-row">
              <PrimaryButton href="/trip">Plan a trip</PrimaryButton>
              <PrimaryButton href="/quick-go" variant="secondary">
                Try Quick Go
              </PrimaryButton>
              <PrimaryButton href="/airports" variant="ghost">
                Explore airports
              </PrimaryButton>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Some prices and availability are estimates. Street parking rules vary by block,
            posted signs always win, and cached options may be shown when live refresh is rate-limited.
          </p>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 top-8 h-44 w-44 rounded-full bg-travel-sky/16 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-8 left-4 h-28 w-28 rounded-full bg-travel-teal/10 blur-3xl"
          />
          <GlassPanel className="travel-pass-frame relative overflow-hidden p-4 sm:p-6">
            <div className="travel-pass-card overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-white">
              <div className="border-b border-white/10 bg-white/5 px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/90">
                  Trip dashboard preview
                </div>
                <div className="mt-2 text-2xl font-bold text-white">Airport day + city trip</div>
              </div>
              <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-100/75">
                    Airport day
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">SEA departure</div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-sky-100/90">Leave by</span>
                    <span className="text-lg font-bold text-sky-300">6:42 AM</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusPill tone="accent" className="border-sky-300/25 bg-sky-400/15 text-sky-100">
                      TSA/checklist
                    </StatusPill>
                    <StatusPill tone="muted" className="border-white/15 bg-white/10 text-slate-100">
                      Airport parking
                    </StatusPill>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-100/75">
                    City trip
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">Downtown Seattle</div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-sky-100/90">Best option</span>
                    <span className="text-lg font-bold text-sky-300">Drive + park</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusPill tone="accent" className="border-sky-300/25 bg-sky-400/15 text-sky-100">
                      Street outlook
                    </StatusPill>
                    <StatusPill tone="muted" className="border-white/15 bg-white/10 text-slate-100">
                      Park & Ride backup
                    </StatusPill>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border/80 bg-card/90 px-4 py-3 shadow-sm">
                Compare easiest, cheapest, fastest, and least stressful options.
              </div>
              <div className="rounded-2xl border border-border/80 bg-card/90 px-4 py-3 shadow-sm">
                Live data is used when available; saved parking and fallback estimates are labeled.
              </div>
            </div>
          </GlassPanel>
        </div>
        </div>
      </section>

      <section
        id="quick-go"
        className="scroll-mt-20 mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6 md:pt-14 md:pb-8"
      >
        <div className="mb-5 flex items-center gap-3 md:mb-6">
          <div className="h-px flex-1 bg-border/70" aria-hidden="true" />
          <div className="max-w-sm text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Need something faster?
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use Quick Go for simple destination checks.
            </p>
          </div>
          <div className="h-px flex-1 bg-border/70" aria-hidden="true" />
        </div>
        <QuickGoPanel />
      </section>

      <section
        id="assistant"
        className="scroll-mt-20 mx-auto max-w-6xl px-4 pb-10 pt-2 sm:px-6 md:pb-14 md:pt-4"
      >
        <div className="mb-5 md:mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Detailed trip planning
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            For airport days, parking duration, destination details, and leave-by timing.
          </p>
        </div>
        <TripAssistantPanel />
      </section>

      <SavedTripsHomeSection />

      <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <SectionHeader
          eyebrow="Why PodPaiGo"
          title="Airport days and city drives in one decision view"
          description="Built for quick scanning on your phone before you head out the door."
          className="mb-8"
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <TravelCard key={feature.title} padding="sm">
              <h2 className="font-semibold text-foreground">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </TravelCard>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card/50 backdrop-blur">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Trip planning should not require five tabs.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Parking sites show parking. Rideshare apps show rides. Transit apps show transit.
              PodPaiGo helps you compare the actual decision: what is easiest, cheapest, fastest,
              and least stressful for this trip - whether you are going to the airport or across town.
            </p>
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <TravelCard key={step} padding="sm" className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{step}</p>
              </TravelCard>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div>© {new Date().getFullYear()} PodPaiGo</div>
        <div className="flex flex-wrap gap-5">
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
          <Link href="/how-it-works" className="hover:text-foreground">
            How it works
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </div>
      </footer>

      <PodPaiGoAssistant page="home" />
    </main>
  );
}
