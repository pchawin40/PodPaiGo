import type { ParkingAccessType } from '../../lib/parking/destinationParkingClassifier';

const ACCESS_LABELS: Record<ParkingAccessType, string> = {
  public: 'Public',
  customer_only: 'Customer only',
  validated_customer: 'Customer only',
  employee_only: 'Employee only',
  resident_only: 'Permit required',
  tenant_only: 'Tenant only',
  permit_only: 'Permit required',
  event_only: 'Visitor parking',
  trailhead_permit: 'Permit required',
  unknown: 'Unknown access',
};

type ParkingAccessBadgeProps = {
  accessType?: ParkingAccessType | null;
  className?: string;
};

export function accessBadgeLabel(accessType?: ParkingAccessType | null): string {
  if (!accessType) return ACCESS_LABELS.unknown;
  return ACCESS_LABELS[accessType] ?? ACCESS_LABELS.unknown;
}

export default function ParkingAccessBadge({
  accessType = 'unknown',
  className = '',
}: ParkingAccessBadgeProps) {
  const label = accessBadgeLabel(accessType);

  return (
    <span
      className={`inline-flex flex-col gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs ${className}`}
      title="Confirm rules with the garage or business before relying on this."
    >
      <span className="font-semibold text-zinc-900">{label}</span>
      <span className="text-zinc-600">
        Confirm rules with the garage or business before relying on this.
      </span>
    </span>
  );
}
