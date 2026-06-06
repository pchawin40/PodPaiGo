export type OptionButtonOptions = {
  compact?: boolean;
  disabled?: boolean;
  className?: string;
};

export function getOptionButtonClass(
  isSelected: boolean,
  options: OptionButtonOptions = {},
): string {
  const { compact = false, disabled = false, className = '' } = options;

  const size = compact
    ? 'pod-option-button pod-option-button--compact rounded-xl border px-3 py-2 text-left text-sm transition'
    : 'pod-option-button pod-option-button--default w-full rounded-2xl border p-4 text-left shadow-sm transition sm:p-5';

  const state = isSelected
    ? 'pod-option-button-selected'
    : 'pod-option-button-unselected';

  return [size, state, disabled ? 'pod-option-button-disabled' : '', className]
    .filter(Boolean)
    .join(' ');
}

export function getOptionCardClass(isSelected: boolean, className = ''): string {
  return [
    'pod-option-card rounded-xl p-4 text-left transition',
    isSelected ? 'pod-option-card-selected' : 'pod-option-card-unselected',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function getOptionSelectedBadgeClass(isSelected: boolean): string {
  return isSelected ? 'pod-option-selected-badge' : 'pod-option-unselected-badge';
}

export function getOptionInlineBadgeClass(): string {
  return 'pod-option-inline-badge';
}
