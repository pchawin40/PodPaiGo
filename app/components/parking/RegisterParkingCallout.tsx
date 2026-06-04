'use client';

import Link from 'next/link';

type RegisterParkingCalloutProps = {
  redirectTo?: string;
  className?: string;
};

/**
 * Friendly sign-in / register prompt shown when a signed-out visitor tries to
 * submit or register a free parking spot.
 */
export default function RegisterParkingCallout({
  redirectTo = '/parking/submit',
  className = '',
}: RegisterParkingCalloutProps) {
  const redirect = encodeURIComponent(redirectTo);

  return (
    <div
      className={`rounded-2xl border border-primary/25 bg-primary/5 p-5 text-sm ${className}`}
    >
      <p className="font-semibold text-foreground">Want to add a free parking spot?</p>
      <p className="mt-1 text-muted-foreground">
        Register or sign in first so PodPaiGo can verify it.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/login?redirect=${redirect}`}
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href={`/login?mode=register&redirect=${redirect}`}
          className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Register
        </Link>
      </div>
    </div>
  );
}
