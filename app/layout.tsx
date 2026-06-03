import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import AppProviders from './components/AppProviders';
import { themeInitScript } from '../lib/theme/themeStorage';

export const metadata: Metadata = {
  title: {
    default: 'PodPaiGo - Airport Parking, Rideshare & Transit Planner',
    template: '%s | PodPaiGo',
  },
  description:
    'Compare airport parking, rideshare, and transit with leave-by timing, estimated total cost, weather impact, walking burden, and trip stress.',
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
