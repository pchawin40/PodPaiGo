import SiteHeader from "../components/SiteHeader";
import TripFlow from "./TripFlow";
import PodPaiGoAssistant from "../components/PodPaiGoAssistant";

export default function TripPage() {
  return (
    <div className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader ctaHref="/" ctaLabel="Home" />
      <TripFlow />
      <PodPaiGoAssistant page="trip" />
    </div>
  );
}