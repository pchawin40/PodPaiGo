export function costOf(option: { cost?: number }): number {
  return typeof option.cost === 'number' ? option.cost : 999;
}

export function formatMoney(n: number) {
  const rounded = Math.round(n * 100) / 100;
  return rounded % 1 === 0 ? `$${rounded.toFixed(0)}` : `$${rounded.toFixed(2)}`;
}

// For savings display, we want to round to whole dollars to avoid implying false precision
export function formatMoneyWhole(n: number) {
  const rounded = Math.round(n);
  return `$${rounded.toLocaleString()}`;
}

export function formatMoneyCents(n: number): string {
  return `$${n.toFixed(2)}`;
}