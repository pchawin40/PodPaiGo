import Link from 'next/link';
import type { ReactNode } from 'react';
import HeroBadge from './components/HeroBadge';
import PodPaiGoAssistant from './components/PodPaiGoAssistant';
import SavedTripsHomeSection from './components/SavedTripsHomeSection';
import SiteHeader from './components/SiteHeader';
import TripAssistantPanel from './components/TripAssistantPanel';
import QuickGoPanel from './components/QuickGoPanel';
import ExpandableSection from './components/ui/ExpandableSection';
import GlassPanel from './components/ui/GlassPanel';
import PrimaryButton from './components/ui/PrimaryButton';
import SectionHeader from './components/ui/SectionHeader';
import StatusPill from './components/ui/StatusPill';
import TravelCard from './components/ui/TravelCard';
import HomeAnalytics from './components/HomeAnalytics';
import {
  DATA_TRANSPARENCY_DISCLOSURE,
  DATA_TRANSPARENCY_SHORT,
  PRODUCT_TAGLINE,
} from '../lib/marketing/publicCopy';

const featureChips = ['Airport trips', 'Destination parking', 'Rideshare vs transit'];

const features = [
  {
    title: 'Airport trips',
    description:
      'See when to leave, where to park, what TSA and check-in will take, and how rideshare or transit compares — all in one view.',
  },
  {
    title: 'City and destination parking',
    description:
      'Drive time, garages and lots near your destination, the street/meter outlook, and backup options for downtown, events, and errands.',
  },
  {
    title: 'Rideshare, transit, and backups',
    description:
      'When driving or parking is not the best call, see how rideshare, transit, and Park & Ride stack up instead.',
  },
];

const steps = [
  {
    title: 'Tell us where you are going',
    detail: 'An airport, address, garage, event, or business — type it or describe the trip.',
  },
  {
    title: 'Pick what matters to you',
    detail: 'Easiest, cheapest, or fastest. Or compare every way to get there side by side.',
  },
  {
    title: 'Get one clear recommendation',
    detail: 'The best option, why it won, what it costs, when to leave, and backups if plans change.',
  },
];

function PreviewMiniCard({
  eyebrow,
  title,
  metricLabel,
  metricValue,
  children,
}: {
  eyebrow: string;
  title: string;
  metricLabel: string;
  metricValue: string;
  children: ReactNode;
}) {
  return (
    <article className="flex h-full min-h-[205px] flex-col rounded-2xl border border-white/10 bg-white/10 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100/75">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-base font-semibold text-white">{title}</h3>
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <span className="text-sm font-semibold text-sky-100/90">{metricLabel}</span>
        <span className="max-w-[7rem] text-right text-xl font-bold leading-tight text-sky-300">
          {metricValue}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">{children}</div>
    </article>
  );
}

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
            Know the best way to get there — and where to park.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {PRODUCT_TAGLINE}
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
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Flying soon?{' '}
              <Link href="/airports" className="font-medium text-primary hover:underline">
                Explore airports
              </Link>
              .
            </p>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">{DATA_TRANSPARENCY_SHORT}</p>
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
              <div className="grid items-stretch gap-3 px-5 py-4 sm:grid-cols-2">
                <PreviewMiniCard
                  eyebrow="Airport day"
                  title="SEA departure"
                  metricLabel="Leave by"
                  metricValue="6:42 AM"
                >
                  <StatusPill tone="accent" className="border-sky-300/25 bg-sky-400/15 text-sky-100">
                    TSA/checklist
                  </StatusPill>
                  <StatusPill tone="muted" className="border-white/15 bg-white/10 text-slate-100">
                    Airport parking
                  </StatusPill>
                </PreviewMiniCard>

                <PreviewMiniCard
                  eyebrow="City trip"
                  title="Downtown Seattle"
                  metricLabel="Best option"
                  metricValue="Drive + park"
                >
                  <StatusPill tone="accent" className="border-sky-300/25 bg-sky-400/15 text-sky-100">
                    Street outlook
                  </StatusPill>
                  <StatusPill tone="muted" className="border-white/15 bg-white/10 text-slate-100">
                    Park & Ride backup
                  </StatusPill>
                </PreviewMiniCard>
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
              Fastest way to start
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Type one destination and get drive time, parking, and the best way there.
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
            Or just describe your trip
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask PodPaiGo in your own words — great for airport days, multiple stops, or “what should I do?”
          </p>
        </div>
        <TripAssistantPanel />
      </section>

      <SavedTripsHomeSection />

      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <SectionHeader
          eyebrow="Why PodPaiGo"
          title="What PodPaiGo helps with"
          description="Built for quick scanning on your phone before you head out the door."
          className="mb-6"
        />
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <TravelCard key={feature.title} padding="sm">
              <h2 className="font-semibold text-foreground">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </TravelCard>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <div className="space-y-3">
          <ExpandableSection
            title="How it works"
            summary="Three steps from destination to one clear recommendation"
          >
            <p className="text-sm leading-6 text-muted-foreground">
              Parking sites show parking. Rideshare apps show rides. Transit apps show transit.
              PodPaiGo compares the actual decision: what is easiest, cheapest, fastest, and least
              stressful for this trip — whether you are going to the airport or across town.
            </p>
            <div className="mt-4 space-y-3">
              {steps.map((step, index) => (
                <div key={step.title} className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </ExpandableSection>

          <ExpandableSection
            title="How PodPaiGo uses data"
            summary="Live, estimated, cached, and provider-linked labels explained"
          >
            <p className="text-sm leading-6 text-muted-foreground">{DATA_TRANSPARENCY_DISCLOSURE}</p>
          </ExpandableSection>
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
