export function costOf(option: { cost?: number }): number {
  return typeof option.cost === 'number' ? option.cost : 999;
}