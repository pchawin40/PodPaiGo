export function resolveWeatherDestinationLabel(
  destination: string | null | undefined,
  destinationName?: string | null,
): string | null {
  const named = String(destinationName || '').trim();
  if (named) return named;

  const text = String(destination || '').trim();
  if (!text) return null;

  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3 && /^(?:usa|united states(?: of america)?)$/i.test(parts[parts.length - 1]!)) {
    const city = parts[parts.length - 3]!;
    if (city && !/^\d/.test(city)) return city;
  }

  if (parts.length >= 2) {
    const candidates = parts
      .slice()
      .reverse()
      .map((part) => part.replace(/\s+[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i, '').trim())
      .filter((part) =>
        Boolean(part) &&
        !/^(?:usa|united states(?: of america)?)$/i.test(part) &&
        !/^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i.test(part) &&
        !/^\d/.test(part),
      );

    return candidates[0] || parts[0] || text;
  }

  return parts[0] || text;
}

export function weatherNearDestinationTitle(destinationLabel: string | null): string {
  return destinationLabel ? `Weather near ${destinationLabel}` : 'Weather for your destination';
}
