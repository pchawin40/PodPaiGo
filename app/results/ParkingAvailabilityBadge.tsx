// app/results/ParkingAvailabilityBadge.tsx
import { ParkingOption } from '../../lib/types';
import { getParkingAvailabilityDisplay } from '../../lib/parking/availabilityDisplay';

export default function ParkingAvailabilityBadge({ option }: { option: ParkingOption }) {
  const display = getParkingAvailabilityDisplay(option);

  const className =
    display.tone === 'green'
      ? 'bg-green-50 text-green-700 border-green-200'
      : display.tone === 'red'
        ? 'bg-red-50 text-red-700 border-red-200'
        : display.tone === 'yellow'
          ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
          : 'bg-zinc-50 text-zinc-700 border-zinc-200';

  return (
    <span
      title={display.description}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {display.label}
    </span>
  );
}