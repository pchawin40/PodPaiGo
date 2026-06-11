import type { Metadata } from "next";
import SiteHeader from "../components/SiteHeader";
import TripFlow from "./TripFlow";
import PodPaiGoAssistant from "../components/PodPaiGoAssistant";

export const metadata: Metadata = {
  title: "Plan a Trip",
  description:
    "Plan airport trips and city drives with drive time, parking, street or meter outlook, rideshare, transit, Park & Ride backups, and airport-day details.",
};

export default function TripPage() {
  return (
    <div className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader ctaHref="/" ctaLabel="Home" />
      <TripFlow />
      <PodPaiGoAssistant page="trip" />
    </div>
  );
}
