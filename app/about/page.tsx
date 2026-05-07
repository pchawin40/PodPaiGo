import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
    title: "About",
    description:
        "Learn what PodPaiGo is building for airport parking, rideshare, transit, timing, and travel confidence.",
};

export default function AboutPage() {
    return (
        <main className="min-h-screen bg-slate-50 text-slate-950">
            <SiteHeader/>
            <div className="mx-auto max-w-3xl px-6 py-16">
                <Link href="/" className="text-sm font-medium text-blue-700">
                    ← Back to home
                </Link>

                <h1 className="mt-8 text-4xl font-bold tracking-tight">
                    About PodPaiGo
                </h1>

                <p className="mt-6 text-lg leading-8 text-slate-600">
                    PodPaiGo is an airport trip decision engine. It helps travelers
                    compare parking, rideshare, and transit with the practical details
                    that usually get missed: when to leave, how much the trip may cost,
                    how much walking is involved, whether weather changes the best choice,
                    and how stressful the option may feel.
                </p>

                <div className="mt-10 space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <section>
                        <h2 className="text-xl font-semibold">Why it exists</h2>
                        <p className="mt-2 leading-7 text-slate-600">
                            Airport planning is fragmented. Parking sites, map apps, transit
                            apps, rideshare apps, airport pages, and weather forecasts all
                            answer different parts of the same question. PodPaiGo brings those
                            signals together so travelers can make a clearer choice.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">What it focuses on</h2>
                        <p className="mt-2 leading-7 text-slate-600">
                            The first public draft focuses on a primary airport while the product framework is designed to expand to more airports.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">Current stage</h2>
                        <p className="mt-2 leading-7 text-slate-600">
                            PodPaiGo is an early draft. Some data may be live or verified,
                            while other details are estimated or used as fallback logic. The
                            goal is to make those differences clear.
                        </p>
                    </section>
                </div>

                <Link
                    href="/trip"
                    className="mt-8 inline-flex rounded-full bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
                >
                    Plan a trip
                </Link>
            </div>
        </main>
    );
}