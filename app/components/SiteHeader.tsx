import Link from "next/link";

type SiteHeaderProps = {
  ctaHref?: string;
  ctaLabel?: string;
};

export default function SiteHeader({
  ctaHref = "/trip",
  ctaLabel = "Plan trip",
}: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-slate-950">
          PodPaiGo
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <Link href="/" className="hover:text-slate-950">
            Home
          </Link>
          <Link href="/how-it-works" className="hover:text-slate-950">
            How it works
          </Link>
          <Link href="/airports" className="hover:text-slate-950">
            Airports
          </Link>
          <Link href="/about" className="hover:text-slate-950">
            About
          </Link>
          <Link href="/privacy" className="hover:text-slate-950">
            Privacy
          </Link>
        </nav>

        <Link
          href={ctaHref}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          {ctaLabel}
        </Link>
      </div>
    </header>
  );
}