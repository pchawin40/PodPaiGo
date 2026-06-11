import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";
import PrimaryButton from "../components/ui/PrimaryButton";
import SectionHeader from "../components/ui/SectionHeader";
import TravelCard from "../components/ui/TravelCard";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "How PodPaiGo compares drive time, parking, street rules, rideshare, transit, and airport-day details to pick the best way to get there.",
};

const steps = [
  {
    title: "1. Tell us where you're going",
    body: "Type a destination, or describe the whole trip in your own words. PodPaiGo figures out whether it's an airport day, a downtown trip, an event, or a quick errand.",
  },
  {
    title: "2. Say what matters",
    body: "Pick easiest, cheapest, or fastest — or compare every option. Tell us if you have a car, and roughly when you're leaving.",
  },
  {
    title: "3. Get one clear plan",
    body: "PodPaiGo shows the recommended option, why it won, what it costs, when to leave, and backups in case plans change.",
  },
];

const signals = [
  {
    title: "Timing",
    body: "Drive time, when to leave, parking or transfer time, and airport buffers like TSA when a flight is involved.",
  },
  {
    title: "Cost",
    body: "The full estimated cost of the trip — not just the parking or fare number you'd see on one app.",
  },
  {
    title: "Parking fit",
    body: "Garages, lots, and the street/meter outlook for city trips; airport lots and shuttle hassle for flights.",
  },
  {
    title: "Rideshare and transit",
    body: "How rideshare, taxi, transit, and Park & Ride compare when they're a realistic option for your trip.",
  },
  {
    title: "Stress",
    body: "A simple read on effort — walking, rush hour, weather, transfers, and how confident the route is.",
  },
  {
    title: "What to trust",
    body: "Every number is labeled live, saved, estimated, or unavailable, so you know what to double-check before you go.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          ← Back to home
        </Link>

        <div className="mt-8 max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">How it works</h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Other apps show parking, or rides, or transit. PodPaiGo compares them together and
            answers the real question: what's the best way to get there, and what should you do
            next?
          </p>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <TravelCard key={step.title} padding="sm">
              <h2 className="text-lg font-semibold text-foreground">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </TravelCard>
          ))}
        </section>

        <SectionHeader
          eyebrow="What goes into a recommendation"
          title="Six things PodPaiGo weighs for you"
          className="mt-14"
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {signals.map((signal) => (
            <TravelCard key={signal.title} padding="sm">
              <h3 className="text-lg font-semibold text-foreground">{signal.title}</h3>
              <p className="mt-2 leading-7 text-muted-foreground">{signal.body}</p>
            </TravelCard>
          ))}
        </div>

        <TravelCard className="mt-10">
          <h2 className="text-xl font-semibold text-foreground">One honest note</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Coverage is strongest where PodPaiGo has been tested most, and it varies by airport and
            city. Prices, availability, traffic, weather, and TSA estimates can change, and street
            parking rules vary block by block. Posted signs and the provider always win — confirm
            the important details before you rely on them.
          </p>
        </TravelCard>

        <PrimaryButton href="/trip" className="mt-10">
          Try the planner
        </PrimaryButton>
      </div>
    </main>
  );
}
