import type { Metadata, Viewport } from 'next';
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
  applicationName: 'PodPaiGo',
  appleWebApp: {
    capable: true,
    title: 'PodPaiGo',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#2563EB',
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
