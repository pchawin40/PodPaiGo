import type {
  UserParkingSpaceInput,
  UserParkingSpaceRecord,
} from './userParkingSpacesTypes';

const ENDPOINT = '/api/parking/submissions';

function authHeaders(accessToken: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function parseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  return body?.message || body?.error || `Request failed (${response.status})`;
}

export async function listMyParkingSpaces(
  accessToken: string | null,
): Promise<UserParkingSpaceRecord[]> {
  const response = await fetch(ENDPOINT, { headers: authHeaders(accessToken) });
  if (!response.ok) throw new Error(await parseError(response));
  const body = (await response.json()) as { spaces: UserParkingSpaceRecord[] };
  return body.spaces ?? [];
}

export async function createParkingSpace(
  accessToken: string | null,
  input: UserParkingSpaceInput,
): Promise<UserParkingSpaceRecord> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await parseError(response));
  const body = (await response.json()) as { space: UserParkingSpaceRecord };
  return body.space;
}

export async function updateParkingSpace(
  accessToken: string | null,
  id: string,
  input: UserParkingSpaceInput,
): Promise<UserParkingSpaceRecord> {
  const response = await fetch(ENDPOINT, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ ...input, id }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  const body = (await response.json()) as { space: UserParkingSpaceRecord };
  return body.space;
}

export async function deleteParkingSpace(
  accessToken: string | null,
  id: string,
): Promise<void> {
  const response = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!response.ok) throw new Error(await parseError(response));
}
