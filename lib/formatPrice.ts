export function formatOptionPrice(option: {
  price?: number;
  priceDisplay?: string;
  priceUnit?: string;
}) {
  if (
    option.priceDisplay === 'check-live' &&
    (!option.price || option.price <= 0)
  ) {
    return 'Check live price';
  }

  if (!option.price || option.price <= 0) {
    return 'Check live price';
  }

  const dollars = `$${Math.round(option.price)}`;

  if (option.priceUnit === 'total') return dollars;

  return `${dollars}/day`;
}