'use client';

import {
  AFFILIATE_DISCLOSURE,
  buildParkingMonetizationCtas,
  type OutboundClickPayload,
} from '../../lib/monetization/outboundClickTypes';
import {
  copyTextThenOpenWithTracking,
  openTrackedUrl,
} from '../../lib/monetization/trackOutboundClick';

type ParkingProviderActionsProps = {
  bookingUrl: string | null;
  providerUrl?: string | null;
  directionsUrl?: string | null;
  searchQuery: string;
  provider?: string | null;
  airportCode?: string | null;
  parkingLotId?: string | null;
  tripId?: string | null;
  accessToken?: string | null;
  compact?: boolean;
};

function buildTracking(
  eventType: string,
  destinationUrl: string | null,
  props: ParkingProviderActionsProps,
): OutboundClickPayload {
  return {
    eventType,
    provider: props.provider,
    airportCode: props.airportCode,
    parkingLotId: props.parkingLotId,
    destinationUrl,
    tripId: props.tripId,
    metadata: {
      surface: props.compact ? 'option-card-compact' : 'option-card',
    },
  };
}

export default function ParkingProviderActions(props: ParkingProviderActionsProps) {
  const ctas = buildParkingMonetizationCtas({
    bookingUrl: props.bookingUrl,
    providerUrl: props.providerUrl,
    directionsUrl: props.directionsUrl,
  });

  const buttonClass = props.compact
    ? 'inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold'
    : 'inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold';

  return (
    <div className="flex w-full flex-col gap-2">
      {ctas.reserveEnabled ? (
        <button
          type="button"
          onClick={() =>
            void copyTextThenOpenWithTracking(
              props.searchQuery,
              ctas.reserveUrl!,
              buildTracking('reserve_parking', ctas.reserveUrl, props),
              props.accessToken,
            )
          }
          className={buttonClass + ' bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700'}
        >
          {ctas.reserveLabel}
        </button>
      ) : (
        <button
          type="button"
          disabled
          className={
            buttonClass +
            ' cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-500'
          }
        >
          {ctas.reserveLabel}
        </button>
      )}

      {ctas.viewProviderEnabled ? (
        <button
          type="button"
          onClick={() =>
            openTrackedUrl(
              ctas.viewProviderUrl!,
              buildTracking('view_provider', ctas.viewProviderUrl, props),
              props.accessToken,
            )
          }
          className={
            buttonClass +
            ' border border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
          }
        >
          {ctas.viewProviderLabel}
        </button>
      ) : null}

      {ctas.directionsEnabled ? (
        <button
          type="button"
          onClick={() =>
            openTrackedUrl(
              ctas.directionsUrl!,
              buildTracking('get_directions', ctas.directionsUrl, props),
              props.accessToken,
            )
          }
          className={
            buttonClass +
            ' border border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
          }
        >
          {ctas.directionsLabel}
        </button>
      ) : null}

      <p className="text-[11px] leading-4 text-slate-500">{AFFILIATE_DISCLOSURE}</p>
    </div>
  );
}

export { AFFILIATE_DISCLOSURE };
