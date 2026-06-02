import SiteHeader from "../components/SiteHeader";
import TripFlow from "./TripFlow";
import PodPaiGoAssistant from "../components/PodPaiGoAssistant";

export default function TripPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <SiteHeader ctaHref="/" ctaLabel="Home" />
      <TripFlow />
      <PodPaiGoAssistant page="trip" />
    </div>
  );
}