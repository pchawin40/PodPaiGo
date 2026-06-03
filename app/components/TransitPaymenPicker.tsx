'use client';

import {
  getTransitPassOptionButtonLabel,
  getTransitPassPickerPrompt,
  resolveTransitPaymentRegionContext,
  type TransitPaymentRegionContext,
} from '../../lib/transit/transitPaymentLabels';

export type TransitPaymentOption = 'normal' | 'orca-pass';

type TransitPaymentPickerProps = {
  value: TransitPaymentOption;
  onChange: (value: TransitPaymentOption) => void;
  airportCode?: string | null;
  region?: string | null;
  className?: string;
};

export default function TransitPaymentPicker({
  value,
  onChange,
  airportCode,
  region,
  className = '',
}: TransitPaymentPickerProps) {
  const context: TransitPaymentRegionContext = resolveTransitPaymentRegionContext({
    airportCode,
    region,
  });
  const passLabel = getTransitPassOptionButtonLabel(context);

  return (
    <div className={`rounded-2xl border border-border bg-muted/30 p-4 ${className}`}>
      <div className="text-sm font-medium text-foreground">Transit payment</div>
      <p className="mt-1 text-sm text-muted-foreground">{getTransitPassPickerPrompt(context)}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange('normal')}
          className={
            `rounded-xl border p-4 text-left transition ` +
            (value === 'normal'
              ? 'border-primary bg-primary/10'
              : 'border-border bg-card hover:bg-muted/50')
          }
        >
          <div className="text-sm font-semibold text-foreground">I’ll pay normally</div>
          <div className="mt-1 text-xs text-muted-foreground">Estimate normal transit fare.</div>
        </button>

        <button
          type="button"
          onClick={() => onChange('orca-pass')}
          className={
            `rounded-xl border p-4 text-left transition ` +
            (value === 'orca-pass'
              ? 'border-primary bg-primary/10'
              : 'border-border bg-card hover:bg-muted/50')
          }
        >
          <div className="text-sm font-semibold text-foreground">{passLabel}</div>
          <div className="mt-1 text-xs text-muted-foreground">Show transit fare as $0.</div>
        </button>
      </div>
    </div>
  );
}
