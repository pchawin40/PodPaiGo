import {
  buildTypedDestinationFallback,
  destinationSearchResultToSelection,
} from '../../search/destinationSearch';
import type { DestinationSearchResult } from '../../search/destinationSearchTypes';
import { buildQuickGoSearchParams } from '../quickGo';
import { parseTripDataFromSearchParams } from '../searchParams';

const manualOrigin = {
  origin: '13907 Chain Lake Rd, Monroe, WA 98272',
  originLabel: '13907 Chain Lake Rd, Monroe, WA 98272',
  originSource: 'manual' as const,
};

const fredMeyerPlaceResult: DestinationSearchResult = {
  id: 'google:fred-meyer',
  label: 'Fred Meyer',
  address: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
  category: 'retail',
  source: 'google',
  lat: 47.859,
  lng: -121.972,
  confidence: 'high',
};

describe('Quick Go destination coordinate preservation', () => {
  test('a selected Google Places destination preserves lat/lng through params and parsing', () => {
    const selection = destinationSearchResultToSelection(fredMeyerPlaceResult);
    expect(selection.destinationLat).toBe(47.859);
    expect(selection.destinationLng).toBe(-121.972);

    const params = buildQuickGoSearchParams({
      destination: selection,
      origin: manualOrigin,
    });

    expect(params.get('destinationLat')).toBe('47.859');
    expect(params.get('destinationLng')).toBe('-121.972');

    const tripData = parseTripDataFromSearchParams(params);
    expect(tripData?.destinationLat).toBeCloseTo(47.859, 3);
    expect(tripData?.destinationLng).toBeCloseTo(-121.972, 3);
  });

  test('a typed destination with no coordinates omits lat/lng (relies on server geocoding)', () => {
    const selection = destinationSearchResultToSelection(
      buildTypedDestinationFallback('Fred Meyer, 18805 US-2, Monroe, WA 98272'),
    );
    expect(selection.destinationLat).toBeUndefined();
    expect(selection.destinationLng).toBeUndefined();

    const params = buildQuickGoSearchParams({
      destination: selection,
      origin: manualOrigin,
    });

    expect(params.get('destinationLat')).toBeNull();
    expect(params.get('destinationLng')).toBeNull();
    // Destination text is still preserved so the server can geocode it for routing.
    expect(params.get('destination')).toContain('Fred Meyer');
  });
});
