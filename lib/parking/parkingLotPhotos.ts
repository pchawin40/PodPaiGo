import { getDb } from '../db/client';
import { withTimeout } from '../utils/asyncTimeout';
import { googlePlacePhotoImageUrl } from '../providers/parking/shared/urls';
import { isGooglePlacePhotosLiveBlocked } from './googlePlacesGuard';
import { GOOGLE_PHOTOS_SAFE_MODE_MESSAGE } from './googlePlacesSafeMode';
import {
  applyParkingPhotoSelectionToOption,
  buildPlaceholderParkingPhoto,
  isGooglePhotoProxyUrl,
  type ParkingLotPhotoLookup,
  type ParkingPhotoSelection,
  type ParkingPhotoSource,
} from './parkingLotPhotoShared';

export type { ParkingLotPhotoLookup, ParkingPhotoSelection, ParkingPhotoSource };
export {
  applyParkingPhotoSelectionToOption,
  buildPlaceholderParkingPhoto,
  isGooglePhotoProxyUrl,
};

type ParkingLotPhotoRow = {
  id: string;
  parking_lot_id: string | null;
  provider: string | null;
  provider_lot_id: string | null;
  google_place_id: string | null;
  airport_code: string | null;
  image_url: string;
  storage_path: string | null;
  source: 'first_party' | 'partner' | 'provider' | 'google_live_placeholder';
  attribution: string | null;
  attribution_url: string | null;
  license_note: string | null;
  is_primary: boolean;
};

const PHOTO_READ_TIMEOUT_MS = Number(process.env.PARKING_LOT_PHOTO_READ_TIMEOUT_MS || 2500);

function rowToSelection(row: ParkingLotPhotoRow): ParkingPhotoSelection {
  return {
    imageUrl: row.image_url,
    source: row.source === 'google_live_placeholder' ? 'placeholder' : row.source,
    attribution: row.attribution || row.license_note || null,
    attributionUrl: row.attribution_url || null,
    requiresGoogleAttribution: false,
  };
}

export function buildGoogleLiveParkingPhoto(
  googlePhotoName: string | null | undefined,
  source: 'google_live' | 'google_business' = 'google_live',
): ParkingPhotoSelection | null {
  if (isGooglePlacePhotosLiveBlocked()) return null;

  const imageUrl = googlePlacePhotoImageUrl(googlePhotoName);
  if (!imageUrl) return null;

  return {
    imageUrl,
    source,
    attribution: 'Photo © Google',
    attributionUrl: 'https://maps.google.com',
    requiresGoogleAttribution: true,
  };
}

export async function lookupParkingLotPhotoFromDb(
  lot: ParkingLotPhotoLookup,
): Promise<ParkingPhotoSelection | null> {
  const parkingLotId = lot.parkingLotId?.trim() || null;
  const provider = lot.provider?.trim() || null;
  const providerLotId = lot.providerLotId?.trim() || null;
  const googlePlaceId = lot.googlePlaceId?.trim() || null;
  const airportCode = lot.airportCode?.trim().toUpperCase() || null;

  if (!parkingLotId && !(provider && providerLotId) && !googlePlaceId) {
    return null;
  }

  try {
    const result = await withTimeout(
      getDb().query<ParkingLotPhotoRow>(
        `
          select
            id,
            parking_lot_id,
            provider,
            provider_lot_id,
            google_place_id,
            airport_code,
            image_url,
            storage_path,
            source,
            attribution,
            attribution_url,
            license_note,
            is_primary
          from parking_lot_photos
          where source in ('first_party', 'partner', 'provider')
            and (
              ($1::text is not null and parking_lot_id = $1)
              or ($2::text is not null and $3::text is not null and provider = $2 and provider_lot_id = $3)
              or ($4::text is not null and google_place_id = $4)
            )
          order by
            is_primary desc,
            case source
              when 'first_party' then 1
              when 'partner' then 2
              when 'provider' then 3
              else 4
            end,
            updated_at desc
          limit 1
        `,
        [parkingLotId, provider, providerLotId, googlePlaceId],
      ),
      PHOTO_READ_TIMEOUT_MS,
      'Parking lot photo lookup',
    );

    const row = result.rows[0];
    if (!row) return null;

    if (airportCode && row.airport_code && row.airport_code.toUpperCase() !== airportCode) {
      return null;
    }

    if (isGooglePhotoProxyUrl(row.image_url)) {
      return null;
    }

    return rowToSelection(row);
  } catch {
    return null;
  }
}

export async function getBestParkingPhoto(
  lot: ParkingLotPhotoLookup,
): Promise<ParkingPhotoSelection> {
  const tripContext = lot.tripContext ?? 'airport_trip';

  const googlePhoto = buildGoogleLiveParkingPhoto(lot.googlePhotoName);
  if (googlePhoto?.imageUrl) {
    return googlePhoto;
  }

  const dbPhoto = await lookupParkingLotPhotoFromDb(lot);
  if (dbPhoto?.imageUrl) {
    return dbPhoto;
  }

  const placeholder = buildPlaceholderParkingPhoto(lot, tripContext);
  if (lot.googlePhotoName?.trim() && isGooglePlacePhotosLiveBlocked()) {
    return {
      ...placeholder,
      safeModeNotice: GOOGLE_PHOTOS_SAFE_MODE_MESSAGE,
    };
  }

  return placeholder;
}
