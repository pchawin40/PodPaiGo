function readPerRequestCap(envName: string, productionDefault: number): number {
  const raw = process.env[envName];
  if (raw !== undefined && raw !== '') {
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }

  return process.env.NODE_ENV === 'production' ? productionDefault : 0;
}

export function getMaxGoogleSearchTextPerRequest(): number {
  return readPerRequestCap('MAX_GOOGLE_SEARCHTEXT_PER_REQUEST', 50);
}

export function getMaxGooglePlaceDetailsPerRequest(): number {
  return readPerRequestCap('MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST', 50);
}

export function getMaxGooglePhotoMediaPerRequest(): number {
  return readPerRequestCap('MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST', 20);
}

export function getMaxGooglePlacesCallsPerRequest(): number {
  return readPerRequestCap('MAX_GOOGLE_PLACES_CALLS_PER_REQUEST', 100);
}
