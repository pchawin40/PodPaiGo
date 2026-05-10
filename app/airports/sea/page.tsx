import type { Metadata } from "next";
import SiteHeader from "@/app/components/SiteHeader";
import AirportPlanner from "../AirportPlanner";
import { getAirportById } from "../../../lib/airports/catalog";

export const metadata: Metadata = {
  title: "SEA Airport Planner",
  description:
    "Plan SeaTac trips with parking, rideshare, transit, timing, weather, and airport guidance.",
};

export default function SeaAirportPage() {
  const airport = getAirportById("SEA")!;

  return (
    <>
      <SiteHeader />
      <AirportPlanner airport={airport} />
    </>
  );
}
