import type { ParkingOption } from '../../lib/types';

type ValidationStatus = NonNullable<ParkingOption['validationStatus']>;

const VALIDATION_LABELS: Record<ValidationStatus, string> = {
  free: 'Free',
  validated: 'Validated',
  possibly_validated: 'May validate',
  paid_only: 'Paid only',
  unknown: 'Unknown',
};

type ParkingValidationBadgeProps = {
  status?: ValidationStatus | null;
  className?: string;
};

export function validationBadgeLabel(status?: ValidationStatus | null): string {
  if (!status) return VALIDATION_LABELS.unknown;
  return VALIDATION_LABELS[status] ?? VALIDATION_LABELS.unknown;
}

export default function ParkingValidationBadge({
  status = 'unknown',
  className = '',
}: ParkingValidationBadgeProps) {
  const label = validationBadgeLabel(status);

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
