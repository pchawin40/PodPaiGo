import type { ParkingCheckInTimingMessage } from '../../lib/airports/airportLeaveBy';

export default function ParkingCheckInTimingBanner({
  message,
}: {
  message: ParkingCheckInTimingMessage;
}) {
  const toneClass =
    message.status === 'late'
      ? 'border-amber-300/40 bg-amber-50 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100'
      : message.status === 'early'
        ? 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100'
        : message.status === 'unknown'
          ? 'border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-500/30 dark:bg-zinc-400/10 dark:text-zinc-100'
          : 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100';

  return (
    <div className={`rounded-xl border p-3 text-sm leading-snug ${toneClass}`}>
      <div className="font-semibold">{message.title}</div>
      <p className="mt-1 text-[13px] leading-relaxed opacity-95">{message.body}</p>
      {message.basis ? (
        <p className="mt-2 text-xs leading-relaxed opacity-80">{message.basis}</p>
      ) : null}
    </div>
  );
}
