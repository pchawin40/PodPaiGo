import { Suspense } from 'react';
import SiteHeader from '../components/SiteHeader';
import AuthForm from '../components/AuthForm';

export default function LoginPage() {
  return (
    <main className="airport-page-bg min-h-screen text-slate-950">
      <SiteHeader ctaHref="/trip" ctaLabel="Plan trip" />

      <section className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-slate-950">Account</h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in to save trips and view your history across devices.
          </p>
        </div>

        <Suspense fallback={<div className="rounded-3xl border border-sky-100 bg-white p-6">Loading…</div>}>
          <AuthForm />
        </Suspense>
      </section>
    </main>
  );
}
