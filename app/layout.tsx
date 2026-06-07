import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import AppProviders from './components/AppProviders';
import { themeInitScript } from '../lib/theme/themeStorage';

export const metadata: Metadata = {
  title: {
    default: 'PodPaiGo - Airport Trips & City Parking Planner',
    template: '%s | PodPaiGo',
  },
  description:
    'Plan airport trips and city parking in one clean dashboard. Compare drive time, parking, street or meter rules, rideshare, transit, and airport-day details.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <Script id="podpaigo-theme-init" strategy="beforeInteractive">
          {themeInitScript()}
        </Script>
      </head>
      <body className="min-h-full flex flex-col text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
