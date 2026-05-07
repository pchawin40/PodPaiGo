import SiteHeader from "@/app/components/SiteHeader";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "SeaTac Airport Planner",
    description:
        "Compare SeaTac parking, rideshare, and transit options with leave-by timing, walking burden, weather impact, and estimated trip stress.",
};

const seaFeatures = [
    "Airport parking and off-airport parking comparison",
    "Rideshare and transit comparison",
    "Leave-by timing for departures",
    "Weather-adjusted parking preferences",
    "Walking burden and luggage effort estimates",
    "Estimated availability risk and shuttle confidence",
];

export default function SeaAirportPage() {
    return (
        <main className="min-h-screen bg-slate-50 text-slate-950">
            <SiteHeader/>
            <div className="mx-auto max-w-5xl px-6 py-16">
                <Link href="/" className="text-sm font-medium text-blue-700">
                    ← Back to home
                </Link>

                <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                    <p className="text-sm font-medium uppercase tracking-wide text-blue-700">
                        SEA / SeaTac
                    </p>

                    <h1 className="mt-3 text-4xl font-bold tracking-tight">
                        SeaTac airport trip planner
                    </h1>

                    <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
                        This page shows how PodPaiGo applies its airport decision engine to
                        Seattle-Tacoma International Airport. The same framework can expand to other
                        airports: compare parking, rideshare, and transit using timing, cost, walking
                        burden, weather, confidence, and stress signals.
                    </p>

                    <div className="mt-8 grid gap-3 md:grid-cols-2">
                        {seaFeatures.map((feature) => (
                            <div
                                key={feature}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
                            >
                                {feature}
                            </div>
                        ))}
                    </div>

                    <Link
                        href="/trip?destination=Central%20Terminal"
                        className="mt-8 inline-flex rounded-full bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
                    >
                        Plan an airport trip
                    </Link>
                </section>

                <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                    <h2 className="text-2xl font-semibold">What PodPaiGo estimates</h2>
                    <p className="mt-3 leading-7 text-slate-600">
                        For each airport, PodPaiGo can consider drive time, parking duration,
                        parking transfer time, shuttle friction, checkpoint walk estimates,
                        TSA timing, weather exposure, and price confidence. Some information
                        may be live or verified, while other information is estimated.
                    </p>
                </section>
            </div>
        </main>
    );
}