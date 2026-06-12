import type { EventParkingSignal } from '@/lib/types';

type EventParkingWarningProps = {
  destinationName?: string | null;
  compact?: boolean;
  className?: string;
  signal?: EventParkingSignal | null;
};

export default function EventParkingWarning({
  destinationName,
  compact = false,
  className = '',
  signal,
}: EventParkingWarningProps) {
  if (!signal || signal.status === 'none') return null;

  const isConfirmedEvent = signal.status === 'confirmed-event';
  const title = isConfirmedEvent ? 'Event detected nearby' : 'Event venue caution';
  const sourceLabel =
    signal.source === 'ticketmaster'
      ? 'Event source: Ticketmaster'
      : 'Venue caution';

  return (
    <section
      aria-label={destinationName ? `${title} for ${destinationName}` : title}
      className={`rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-amber-950 shadow-sm dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100 ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500"
        />
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className={`${compact ? 'mt-1' : 'mt-1.5'} text-sm leading-6`}>
            {signal.warningCopy}
          </p>
          <div className="mt-2 text-xs font-medium text-amber-900/80 dark:text-amber-100/80">
            {signal.eventUrl && isConfirmedEvent ? (
              <a
                href={signal.eventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-amber-700/40 underline-offset-2 hover:text-amber-800 dark:decoration-amber-100/40 dark:hover:text-amber-50"
              >
                {sourceLabel}
              </a>
            ) : (
              sourceLabel
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
