'use client';

import {
  getTransitPassOptionButtonLabel,
  getTransitPassPickerPrompt,
  resolveTransitPaymentRegionContext,
  type TransitPaymentRegionContext,
} from '../../lib/transit/transitPaymentLabels';
import { getOptionCardClass, getOptionInlineBadgeClass } from '../../lib/ui/optionClasses';

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
          className={getOptionCardClass(value === 'normal')}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="ppg-option-card-title text-sm font-semibold">I’ll pay normally</div>
              <div className="ppg-option-card-description mt-1 text-xs">
                Estimate normal transit fare.
              </div>
            </div>
            {value === 'normal' ? (
              <span className={getOptionInlineBadgeClass()}>Selected</span>
            ) : null}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange('orca-pass')}
          className={getOptionCardClass(value === 'orca-pass')}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="ppg-option-card-title text-sm font-semibold">{passLabel}</div>
              <div className="ppg-option-card-description mt-1 text-xs">
                Show transit fare as $0.
              </div>
            </div>
            {value === 'orca-pass' ? (
              <span className={getOptionInlineBadgeClass()}>Selected</span>
            ) : null}
          </div>
        </button>
      </div>
    </div>
  );
}
