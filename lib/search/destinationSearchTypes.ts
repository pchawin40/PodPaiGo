import type { SavedDestination } from '../trip/savedDestinations';

export type DestinationSearchSource =
  | 'saved'
  | 'recent'
  | 'airport'
  | 'geocoder'
  | 'google'
  | 'typed';

export type DestinationSearchCategory =
  | 'saved'
  | 'recent'
  | 'airport'
  | 'address'
  | 'retail'
  | 'unknown';

export type DestinationSearchResult = {
  id: string;
  label: string;
  address: string;
  category: DestinationSearchCategory;
  source: DestinationSearchSource;
  lat?: number;
  lng?: number;
  confidence: 'high' | 'medium' | 'low';
  airportCode?: string;
};

export type DestinationSearchOptions = {
  query: string;
  savedDestinations?: SavedDestination[];
  recentDestinations?: string[];
  limit?: number;
  signal?: AbortSignal;
};

export type GeocoderPrediction = {
  description: string;
  place_id: string;
};

export type DestinationSearchDeps = {
  fetchGeocoder?: (input: string, signal?: AbortSignal) => Promise<GeocoderPrediction[]>;
  fetchGooglePlaces?: (input: string, signal?: AbortSignal) => Promise<DestinationSearchResult[]>;
};
