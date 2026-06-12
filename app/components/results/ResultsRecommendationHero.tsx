'use client';

type HeroAction = {
  label: string;
  onClick: () => void;
};

type ResultsRecommendationHeroProps = {
  headline: string;
  subheadline?: string | null;
  cost: string;
  time: string;
  confidence: string;
  caveat?: string | null;
  whyLine?: string | null;
  primaryAction?: HeroAction | null;
  secondaryAction?: HeroAction | null;
  compareAction?: HeroAction | null;
};

export default function ResultsRecommendationHero({
  headline,
  subheadline,
  cost,
  time,
  confidence,
  caveat,
  whyLine,
  primaryAction,
  secondaryAction,
  compareAction,
}: ResultsRecommendationHeroProps) {
  const metrics = [cost, time, `${confidence} confidence`].filter(Boolean);
  if (caveat?.trim()) {
    metrics.push(caveat.trim());
  }

  return (
    <section
      className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-4 shadow-sm sm:p-5"
      data-testid="recommended-plan-summary"
    >
      <div className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
        Recommended plan
      </div>

      <h2 className="mt-3 text-2xl font-bold leading-tight text-foreground sm:text-3xl">{headline}</h2>

      {subheadline ? (
        <p className="mt-1 text-base font-medium text-foreground sm:text-lg">{subheadline}</p>
      ) : null}

      <div
        className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-foreground"
        data-testid="recommended-plan-inline-metrics"
      >
        {metrics.map((metric, index) => (
          <span key={metric} className="inline-flex items-center gap-2">
            {index > 0 ? <span className="font-normal text-muted-foreground">·</span> : null}
            <span>{metric}</span>
          </span>
        ))}
      </div>

      {whyLine ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground" data-testid="recommended-plan-why">
          <span className="font-medium text-foreground">Why this won: </span>
          {whyLine}
        </p>
      ) : null}

      {(primaryAction || secondaryAction || compareAction) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {primaryAction ? (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
            >
              {primaryAction.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted/80"
            >
              {secondaryAction.label}
            </button>
          ) : null}
          {compareAction ? (
            <button
              type="button"
              onClick={compareAction.onClick}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted/80"
            >
              {compareAction.label}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
