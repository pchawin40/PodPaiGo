import type { PointAbModeKey } from './pointAbRanking';

export const POINT_AB_DETAILS_SECTION_IDS: Record<PointAbModeKey, string> = {
  parking: 'details-destination-parking',
  'street-meter': 'details-street-meter',
  rideshare: 'details-rideshare',
  transit: 'details-transit',
  'park-ride': 'details-park-ride',
};

export function scrollToPointAbDetailsSection(
  sectionId: string,
  options?: { updateHash?: boolean },
): void {
  const el = document.getElementById(sectionId);
  if (!el) return;

  el.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const heading = el.querySelector<HTMLElement>('[data-details-heading]');
  if (heading) {
    heading.focus({ preventScroll: true });
  }

  if (options?.updateHash !== false && window.location.hash !== `#${sectionId}`) {
    window.history.replaceState(null, '', `#${sectionId}`);
  }
}

export function pointAbDetailsSectionId(mode: PointAbModeKey): string {
  return POINT_AB_DETAILS_SECTION_IDS[mode];
}
