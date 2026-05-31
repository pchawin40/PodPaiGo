import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/app/components/SiteHeader";
import AirportPlanner from "../AirportPlanner";
import { ENRICHED_AIRPORT_CODES, getAirportById } from "../../../lib/airports/catalog";

type AirportPageProps = {
  params: Promise<{ code: string }>;
};

export function generateStaticParams() {
  return ENRICHED_AIRPORT_CODES.map((code) => ({
    code: code.toLowerCase(),
  }));
}

export async function generateMetadata({
  params,
}: AirportPageProps): Promise<Metadata> {
  const { code } = await params;
  const airport = getAirportById(code);

  if (!airport) {
    return {
      title: "Airport Planner",
    };
  }

  return {
    title: `${airport.id} Airport Planner`,
    description: `Plan trips to ${airport.label} with parking, rideshare, transit, timing, weather, and airport guidance.`,
  };
}

export default async function AirportPage({ params }: AirportPageProps) {
  const { code } = await params;
  const airport = getAirportById(code);

  if (!airport) notFound();

  return (
    <>
      <SiteHeader />
      <AirportPlanner airport={airport} />
    </>
  );
}
