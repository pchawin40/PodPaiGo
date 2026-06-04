export const USER_PARKING_TYPES = [
  'free',
  'customer_only',
  'time_limited_free',
  'street_free',
  'retail_free',
  'event_free',
  'unknown',
] as const;

export type UserParkingType = (typeof USER_PARKING_TYPES)[number];

export const USER_PARKING_STATUSES = [
  'pending',
  'verified',
  'rejected',
  'needs_more_info',
] as const;

export type UserParkingStatus = (typeof USER_PARKING_STATUSES)[number];

export type UserParkingSpaceRecord = {
  id: string;
  user_id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  parking_type: UserParkingType;
  price: number;
  is_free: boolean;
  time_limit_minutes: number | null;
  overnight_allowed: boolean | null;
  validation_required: boolean;
  business_name: string | null;
  lot_rules: string | null;
  notes: string | null;
  evidence_url: string | null;
  source: string;
  status: UserParkingStatus;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Fields a signed-in user may submit or edit. Server controls user_id, status,
 * source, verification fields, and geocoded lat/lng.
 */
export type UserParkingSpaceInput = {
  name: string;
  address: string;
  parking_type: UserParkingType;
  time_limit_minutes?: number | null;
  overnight_allowed?: boolean | null;
  validation_required?: boolean;
  business_name?: string | null;
  lot_rules?: string | null;
  notes?: string | null;
  evidence_url?: string | null;
  google_place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export const USER_PARKING_TYPE_LABELS: Record<UserParkingType, string> = {
  free: 'Free parking',
  customer_only: 'Customer-only parking',
  time_limited_free: 'Free for a limited time',
  street_free: 'Free street parking',
  retail_free: 'Retail / store lot',
  event_free: 'Event parking',
  unknown: 'Unknown / not sure',
};

export const USER_PARKING_STATUS_LABELS: Record<UserParkingStatus, string> = {
  pending: 'Pending verification',
  verified: 'Verified by PodPaiGo',
  rejected: 'Rejected',
  needs_more_info: 'Needs more info',
};

export const MAX_USER_PARKING_NAME_LENGTH = 160;
export const MAX_USER_PARKING_ADDRESS_LENGTH = 240;
export const MAX_USER_PARKING_TEXT_LENGTH = 2000;
export const MAX_USER_PARKING_URL_LENGTH = 500;

export function isUserParkingType(value: unknown): value is UserParkingType {
  return typeof value === 'string' && USER_PARKING_TYPES.includes(value as UserParkingType);
}

export function isUserParkingStatus(value: unknown): value is UserParkingStatus {
  return typeof value === 'string' && USER_PARKING_STATUSES.includes(value as UserParkingStatus);
}

/** A user may edit a submission only while it is pending or needs more info. */
export function isUserParkingEditable(status: UserParkingStatus): boolean {
  return status === 'pending' || status === 'needs_more_info';
}

export type UserParkingValidationResult =
  | { ok: true; value: Required<Pick<UserParkingSpaceInput, 'name' | 'address' | 'parking_type'>> & UserParkingSpaceInput }
  | { ok: false; error: string };

/**
 * Validate + normalize raw input (from API body or form) into a clean shape.
 * Pure function so it can be reused on client and server and unit-tested.
 */
export function validateUserParkingInput(raw: unknown): UserParkingValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Expected a submission object.' };
  }

  const body = raw as Record<string, unknown>;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { ok: false, error: 'Parking name is required.' };
  if (name.length > MAX_USER_PARKING_NAME_LENGTH) {
    return { ok: false, error: `Parking name must be at most ${MAX_USER_PARKING_NAME_LENGTH} characters.` };
  }

  const address = typeof body.address === 'string' ? body.address.trim() : '';
  if (!address) return { ok: false, error: 'Address is required.' };
  if (address.length > MAX_USER_PARKING_ADDRESS_LENGTH) {
    return { ok: false, error: `Address must be at most ${MAX_USER_PARKING_ADDRESS_LENGTH} characters.` };
  }

  const parkingType = isUserParkingType(body.parking_type) ? body.parking_type : 'free';

  let timeLimit: number | null = null;
  if (body.time_limit_minutes !== undefined && body.time_limit_minutes !== null && body.time_limit_minutes !== '') {
    const parsed =
      typeof body.time_limit_minutes === 'number'
        ? body.time_limit_minutes
        : Number.parseInt(String(body.time_limit_minutes), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, error: 'Time limit must be a non-negative number of minutes.' };
    }
    timeLimit = parsed;
  }

  const evidenceUrl =
    typeof body.evidence_url === 'string' && body.evidence_url.trim() ? body.evidence_url.trim() : null;
  if (evidenceUrl) {
    if (evidenceUrl.length > MAX_USER_PARKING_URL_LENGTH) {
      return { ok: false, error: 'Evidence link is too long.' };
    }
    if (!/^https?:\/\//i.test(evidenceUrl)) {
      return { ok: false, error: 'Evidence link must start with http:// or https://.' };
    }
  }

  const clampText = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, MAX_USER_PARKING_TEXT_LENGTH);
  };

  const numericOrNull = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    ok: true,
    value: {
      name,
      address,
      parking_type: parkingType,
      time_limit_minutes: timeLimit,
      overnight_allowed:
        body.overnight_allowed === true ? true : body.overnight_allowed === false ? false : null,
      validation_required: body.validation_required === true,
      business_name: clampText(body.business_name),
      lot_rules: clampText(body.lot_rules),
      notes: clampText(body.notes),
      evidence_url: evidenceUrl,
      google_place_id: clampText(body.google_place_id),
      lat: numericOrNull(body.lat),
      lng: numericOrNull(body.lng),
    },
  };
}
