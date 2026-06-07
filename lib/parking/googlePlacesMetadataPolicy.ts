type StoredPlaceMetadata = {
  googlePlaceName?: string;
  googleFormattedAddress?: string;
  googleMapsUri?: string;
  rating?: number;
  reviewCount?: number;
  photoName?: string;
  photoNames?: string[];
  lat?: number;
  lng?: number;
};

export type GoogleLegacyPlaceSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  types?: string[];
  photoName?: string;
  photoNames?: string[];
  lat?: number;
  lng?: number;
  googleMapsUri?: string;
};

export type GoogleLegacyPlaceDetailsResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  url?: string;
  photoName?: string;
  photoNames?: string[];
  lat?: number;
  lng?: number;
};

export function searchResultHasUsableCoords(
  result: Pick<GoogleLegacyPlaceSearchResult, 'lat' | 'lng'>,
): boolean {
  return typeof result.lat === 'number' && typeof result.lng === 'number';
}

export function searchResultHasSufficientMetadata(
  result: GoogleLegacyPlaceSearchResult,
): boolean {
  return Boolean(
    result.place_id &&
      result.name &&
      typeof result.rating === 'number' &&
      typeof result.user_ratings_total === 'number' &&
      searchResultHasUsableCoords(result) &&
      Boolean(result.photoName || result.photoNames?.length),
  );
}

export function shouldSkipGetPlaceForSearchResult(
  result: GoogleLegacyPlaceSearchResult | null | undefined,
): boolean {
  if (!result?.place_id) return false;
  return searchResultHasSufficientMetadata(result);
}

export function searchResultToDetails(
  result: GoogleLegacyPlaceSearchResult,
): GoogleLegacyPlaceDetailsResult {
  const photoNames = result.photoNames?.length
    ? result.photoNames
    : result.photoName
      ? [result.photoName]
      : [];

  return {
    place_id: result.place_id,
    name: result.name,
    formatted_address: result.formatted_address,
    rating: result.rating,
    user_ratings_total: result.user_ratings_total,
    url: result.googleMapsUri,
    photoName: photoNames[0],
    photoNames,
    lat: result.lat,
    lng: result.lng,
  };
}

export function storedMetadataHasRatingSummary(
  record: Pick<StoredPlaceMetadata, 'rating' | 'reviewCount'> | null | undefined,
): boolean {
  return (
    typeof record?.rating === 'number' &&
    typeof record?.reviewCount === 'number'
  );
}

export function mergeSearchResultWithStoredMetadata(
  result: GoogleLegacyPlaceSearchResult,
  stored?: StoredPlaceMetadata | null,
): GoogleLegacyPlaceDetailsResult {
  const fromSearch = searchResultToDetails(result);

  return {
    ...fromSearch,
    name: fromSearch.name || stored?.googlePlaceName,
    formatted_address: fromSearch.formatted_address || stored?.googleFormattedAddress,
    rating:
      typeof fromSearch.rating === 'number' ? fromSearch.rating : stored?.rating,
    user_ratings_total:
      typeof fromSearch.user_ratings_total === 'number'
        ? fromSearch.user_ratings_total
        : stored?.reviewCount,
    url: fromSearch.url || stored?.googleMapsUri,
    photoName: fromSearch.photoName || stored?.photoName,
    photoNames:
      fromSearch.photoNames?.length
        ? fromSearch.photoNames
        : stored?.photoNames?.length
          ? stored.photoNames
          : stored?.photoName
            ? [stored.photoName]
            : undefined,
    lat: fromSearch.lat ?? stored?.lat,
    lng: fromSearch.lng ?? stored?.lng,
  };
}
