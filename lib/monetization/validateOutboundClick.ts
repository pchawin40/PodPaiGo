import type { OutboundClickPayload } from './outboundClickTypes';

export type OutboundClickInsert = OutboundClickPayload & {
  userId: string | null;
};

export function validateOutboundClickPayload(body: unknown): OutboundClickInsert | null {
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  const eventType = typeof record.eventType === 'string' ? record.eventType.trim() : '';
  if (!eventType) return null;

  const userId =
    typeof record.userId === 'string' && record.userId.trim() ? record.userId.trim() : null;

  return {
    userId,
    eventType,
    provider: typeof record.provider === 'string' ? record.provider : null,
    airportCode: typeof record.airportCode === 'string' ? record.airportCode : null,
    parkingLotId: typeof record.parkingLotId === 'string' ? record.parkingLotId : null,
    destinationUrl: typeof record.destinationUrl === 'string' ? record.destinationUrl : null,
    tripId: typeof record.tripId === 'string' ? record.tripId : null,
    metadata:
      record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
        ? (record.metadata as Record<string, unknown>)
        : {},
  };
}
