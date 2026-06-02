import { Suspense } from 'react';
import AuthCallbackClient from './AuthCallbackClient';

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="airport-page-bg flex min-h-screen items-center justify-center px-4">
          <div className="rounded-3xl border border-sky-100 bg-white px-6 py-8 text-center shadow-[0_18px_60px_rgba(14,116,144,0.12)]">
            <p className="text-sm font-medium text-slate-700">Completing sign-in…</p>
          </div>
        </main>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
