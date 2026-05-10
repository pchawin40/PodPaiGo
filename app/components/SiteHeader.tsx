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
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex w-full items-center justify-between gap-3 md:w-auto">
          <Link href="/" className="text-lg font-bold tracking-tight text-slate-950">
            PodPaiGo
          </Link>

          <Link
            href={ctaHref}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 md:hidden"
          >
            {ctaLabel}
          </Link>
        </div>

        <nav className="flex w-full items-center gap-4 overflow-x-auto pb-1 text-sm font-medium text-slate-600 md:w-auto md:gap-6 md:overflow-visible md:pb-0">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="shrink-0 hover:text-slate-950">
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          href={ctaHref}
          className="hidden rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 md:inline-flex"
        >
          {ctaLabel}
        </Link>
      </div>
    </header>
  );
}
