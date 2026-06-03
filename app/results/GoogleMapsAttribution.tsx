import {
  GOOGLE_MAPS_ATTRIBUTION_LABEL,
  GOOGLE_MAPS_ATTRIBUTION_URL,
} from '../../lib/parking/googlePlacesSafeMode';

export default function GoogleMapsAttribution({
  className = 'text-xs text-zinc-600',
  prefix = 'Data from',
}: {
  className?: string;
  prefix?: string;
}) {
  return (
    <p className={className}>
      {prefix}{' '}
      <a
        href={GOOGLE_MAPS_ATTRIBUTION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-zinc-800 underline decoration-zinc-400 underline-offset-2"
      >
        {GOOGLE_MAPS_ATTRIBUTION_LABEL}
      </a>
    </p>
  );
}
