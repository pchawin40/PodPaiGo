import type { ParkingOption } from '../../lib/types';

export function isCachedParkingOption(option?: ParkingOption | null): boolean {
  if (!option) return false;
  if (option.providerSource === 'destination-cache') return true;
  return Boolean(option.parkingDiscoveryStatus?.startsWith('cache_only'));
}

function formatLastChecked(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function CachedParkingNotice({
  option,
  compact = false,
}: {
  option: ParkingOption;
  compact?: boolean;
}) {
  if (!isCachedParkingOption(option)) return null;

  const lastChecked = formatLastChecked(option.fetchedAt || option.lastUpdated);

  return (
    <div className={`rounded-xl border border-sky-200 bg-sky-50/80 ${compact ? 'p-2 text-xs' : 'p-3 text-sm'} text-sky-950`}>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-sky-300 bg-white px-2.5 py-1 text-xs font-semibold">
          Cached parking option
        </span>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
          Live availability not confirmed
        </span>
      </div>
      <div className="mt-2 font-medium">
        Open directions/provider site to verify price and availability.
      </div>
      {lastChecked ? (
        <div className="mt-1 text-xs text-sky-800">Last checked: {lastChecked}</div>
      ) : null}
    </div>
  );
}
