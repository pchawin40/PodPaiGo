import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/app/components/SiteHeader";
import AirportPlanner from "../AirportPlanner";
import { AIRPORTS_CATALOG, getAirportById } from "../../../lib/airports/catalog";

type AirportPageProps = {
  params: Promise<{ code: string }>;
};

export function generateStaticParams() {
  return AIRPORTS_CATALOG.map((airport) => ({
    code: airport.id.toLowerCase(),
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
