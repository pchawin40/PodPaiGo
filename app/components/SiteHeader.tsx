import Link from "next/link";

type SiteHeaderProps = {
  ctaHref?: string;
  ctaLabel?: string;
};

export default function SiteHeader({
  ctaHref = "/trip",
  ctaLabel = "Plan trip",
}: SiteHeaderProps) {
  const links = [
    { href: "/", label: "Home" },
    { href: "/how-it-works", label: "How it works" },
    { href: "/airports", label: "Airports" },
    { href: "/roadmap", label: "Roadmap" },
    { href: "/about", label: "About" },
    { href: "/privacy", label: "Privacy" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-sky-100/80 bg-white/90 shadow-[0_1px_18px_rgba(14,116,144,0.08)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-6">
        <div className="flex w-full items-center justify-between gap-2 md:w-auto">
          <Link
            href="/"
            className="inline-flex min-w-0 items-center gap-2 rounded-full pr-2 text-base font-bold text-slate-950 sm:text-lg"
            aria-label="PodPaiGo home"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 40 40"
              className="h-9 w-9 shrink-0"
              fill="none"
            >
              <rect width="40" height="40" rx="14" fill="url(#podpaigo-logo-bg)" />
              <path
                d="M11 24.5c4.5-8.6 10.7-12.6 18-12.1"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M11.5 25.5h15.2c2 0 3.8 1.2 4.6 3.1"
                stroke="#BAE6FD"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="14" cy="28" r="2.2" fill="white" />
              <circle cx="27" cy="28" r="2.2" fill="white" />
              <path
                d="M25.7 10.7 31 9.2l-1.3 5.3"
                stroke="white"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="podpaigo-logo-bg" x1="6" y1="4" x2="35" y2="36" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#38BDF8" />
                  <stop offset="1" stopColor="#2563EB" />
                </linearGradient>
              </defs>
            </svg>
            <span className="truncate">PodPaiGo</span>
          </Link>

          <Link
            href={ctaHref}
            className="shrink-0 rounded-full bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 sm:px-4 md:hidden"
          >
            {ctaLabel}
          </Link>
        </div>

        <nav
          aria-label="Primary navigation"
          className="no-scrollbar -mx-1 flex w-full items-center gap-1 overflow-x-auto rounded-full border border-slate-200/80 bg-white/70 p-1 text-sm font-medium text-slate-600 md:mx-0 md:w-auto md:border-0 md:bg-transparent md:p-0"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="shrink-0 rounded-full px-3 py-2 hover:bg-sky-50 hover:text-slate-950 md:px-1.5 md:hover:bg-transparent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          href={ctaHref}
          className="hidden rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 md:inline-flex"
        >
          {ctaLabel}
        </Link>
      </div>
    </header>
  );
}
