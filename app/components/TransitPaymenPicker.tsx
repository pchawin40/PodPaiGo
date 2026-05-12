'use client';

export type TransitPaymentOption = 'normal' | 'orca-pass';

type TransitPaymentPickerProps = {
  value: TransitPaymentOption;
  onChange: (value: TransitPaymentOption) => void;
  className?: string;
};

export default function TransitPaymentPicker({
  value,
  onChange,
  className = '',
}: TransitPaymentPickerProps) {
  return (
    <div className={`rounded-2xl border border-zinc-200 bg-zinc-50 p-4 ${className}`}>
      <div className="text-sm font-medium text-zinc-900">Transit payment</div>
      <p className="mt-1 text-sm text-zinc-600">
        Do you pay per ride, or do you have an ORCA / employer transit pass?
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange('normal')}
          className={
            `rounded-xl border p-4 text-left transition ` +
            (value === 'normal'
              ? 'border-blue-500 bg-blue-50'
              : 'border-zinc-200 bg-white hover:bg-zinc-50')
          }
        >
          <div className="text-sm font-semibold text-zinc-900">I’ll pay normally</div>
          <div className="mt-1 text-xs text-zinc-600">Estimate normal transit fare.</div>
        </button>

        <button
          type="button"
          onClick={() => onChange('orca-pass')}
          className={
            `rounded-xl border p-4 text-left transition ` +
            (value === 'orca-pass'
              ? 'border-blue-500 bg-blue-50'
              : 'border-zinc-200 bg-white hover:bg-zinc-50')
          }
        >
          <div className="text-sm font-semibold text-zinc-900">
            I have ORCA / employer pass
          </div>
          <div className="mt-1 text-xs text-zinc-600">Show transit fare as $0.</div>
        </button>
      </div>
    </div>
  );
}