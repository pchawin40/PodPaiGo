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
    <div className={`ppg-option-panel rounded-2xl p-4 ${className}`}>
      <div className="ppg-option-heading text-sm font-semibold">Transit payment</div>
      <p className="ppg-option-helper mt-1 text-sm">{getTransitPassPickerPrompt(context)}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange('normal')}
          className={
            `ppg-option-card rounded-xl p-4 text-left transition ` +
            (value === 'normal' ? 'ppg-option-card-selected' : '')
          }
        >
          <div className="ppg-option-card-title text-sm font-semibold">I’ll pay normally</div>
          <div className="ppg-option-card-description mt-1 text-xs">
            Estimate normal transit fare.
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange('orca-pass')}
          className={
            `ppg-option-card rounded-xl p-4 text-left transition ` +
            (value === 'orca-pass' ? 'ppg-option-card-selected' : '')
          }
        >
          <div className="ppg-option-card-title text-sm font-semibold">{passLabel}</div>
          <div className="ppg-option-card-description mt-1 text-xs">
            Show transit fare as $0.
          </div>
        </button>
      </div>
    </div>
  );
}
