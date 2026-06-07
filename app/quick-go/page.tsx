import type { Metadata } from 'next';
import SiteHeader from '../components/SiteHeader';
import QuickGoPanel from '../components/QuickGoPanel';

export const metadata: Metadata = {
  title: 'Quick Go',
  description:
    'Quickly compare point-to-point drive time, destination parking, street or meter outlook, rideshare, transit, and Park & Ride backups.',
};

export default function QuickGoPage() {
  return (
    <main className="travel-page-bg min-h-screen text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-3xl scroll-mt-20 px-4 py-10 sm:px-6 md:py-12">
        <QuickGoPanel />
      </div>
    </main>
  );
}
