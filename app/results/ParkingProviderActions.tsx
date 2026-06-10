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
import { trackEvent } from '../../lib/analytics/trackEvent';

type ParkingProviderActionsProps = {
  bookingUrl: string | null;
  providerUrl?: string | null;
  routeToParkingUrl?: string | null;
  parkingToTerminalUrl?: string | null;
  parkingToDestinationUrl?: string | null;
  transferLinkLabel?: string;
  searchQuery: string;
  provider?: string | null;
  airportCode?: string | null;
  parkingLotId?: string | null;
  parkingLotName?: string | null;
  resultType?: string | null;
  tripType?: string | null;
  rank?: number | null;
  priceTotal?: number | null;
  priceLabel?: string | null;
  driveToLotMinutes?: number | null;
  walkMinutes?: number | null;
  tripId?: string | null;
  accessToken?: string | null;
  compact?: boolean;
  onReserve?: () => void;
  reserveLabel?: string;
  infoOnlyBooking?: boolean;
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
      sourcePage: 'results',
      resultType: props.resultType ?? undefined,
      tripType: props.tripType ?? undefined,
      lotName: props.parkingLotName ?? undefined,
      rank: props.rank ?? undefined,
      priceTotal: props.priceTotal ?? undefined,
      priceLabel: props.priceLabel ?? undefined,
      driveToLotMinutes: props.driveToLotMinutes ?? undefined,
      walkMinutes: props.walkMinutes ?? undefined,
    },
  };
}

function buildAnalyticsMetadata(props: ParkingProviderActionsProps, ctaType: string) {
  return {
    provider: props.provider ?? undefined,
    airportCode: props.airportCode ?? undefined,
    lotId: props.parkingLotId ?? undefined,
    lotName: props.parkingLotName ?? undefined,
    resultType: props.resultType ?? undefined,
    tripType: props.tripType ?? undefined,
    rank: props.rank ?? undefined,
    priceTotal: props.priceTotal ?? undefined,
    priceLabel: props.priceLabel ?? undefined,
    driveToLotMinutes: props.driveToLotMinutes ?? undefined,
    walkMinutes: props.walkMinutes ?? undefined,
    sourcePage: 'results',
    ctaType,
  };
}

export default function ParkingProviderActions(props: ParkingProviderActionsProps) {
  const ctas = buildParkingMonetizationCtas({
    bookingUrl: props.bookingUrl,
    providerUrl: props.providerUrl,
    directionsUrl: props.routeToParkingUrl,
    reserveLabel: props.reserveLabel,
    infoOnlyBooking: props.infoOnlyBooking,
  });

  const transferUrl = props.parkingToTerminalUrl || props.parkingToDestinationUrl || null;
  const transferLabel =
    props.transferLinkLabel ||
    (props.parkingToTerminalUrl ? 'Parking to terminal' : 'Parking to destination');

  const buttonClass = props.compact
    ? 'inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold'
    : 'inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold';

  const secondaryButtonClass =
    buttonClass +
    ' border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

  return (
    <div className="flex w-full flex-col gap-2">
      {ctas.reserveEnabled ? (
        <button
          type="button"
          onClick={() => {
            trackEvent('reserve_parking_clicked', {
              accessToken: props.accessToken,
              eventProperties: buildAnalyticsMetadata(props, 'reserve_parking'),
            });
            trackEvent('parking_cta_clicked', {
              accessToken: props.accessToken,
              eventProperties: buildAnalyticsMetadata(props, 'reserve_parking'),
            });
            if (props.onReserve) {
              props.onReserve();
              return;
            }
            void copyTextThenOpenWithTracking(
              props.searchQuery,
              ctas.reserveUrl!,
              buildTracking('reserve_parking', ctas.reserveUrl, props),
              props.accessToken,
            );
          }}
          className={buttonClass + ' bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700'}
        >
          {ctas.reserveLabel}
        </button>
      ) : ctas.viewProviderEnabled ? (
        <button
          type="button"
          onClick={() => {
            trackEvent('parking_cta_clicked', {
              accessToken: props.accessToken,
              eventProperties: buildAnalyticsMetadata(props, 'view_provider'),
            });
            openTrackedUrl(
              ctas.viewProviderUrl!,
              buildTracking('view_provider', ctas.viewProviderUrl, props),
              props.accessToken,
            );
          }}
          className={secondaryButtonClass}
        >
          {ctas.viewProviderLabel}
        </button>
      ) : (
        <button
          type="button"
          disabled
          className={
            buttonClass +
            ' cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
          }
        >
          {ctas.reserveLabel}
        </button>
      )}

      {ctas.directionsEnabled ? (
        <button
          type="button"
          onClick={() => {
            trackEvent('route_to_parking_clicked', {
              accessToken: props.accessToken,
              eventProperties: buildAnalyticsMetadata(props, 'route_to_parking'),
            });
            trackEvent('directions_clicked', {
              accessToken: props.accessToken,
              eventProperties: buildAnalyticsMetadata(props, 'route_to_parking'),
            });
            openTrackedUrl(
              ctas.directionsUrl!,
              buildTracking('route_to_parking', ctas.directionsUrl, props),
              props.accessToken,
            );
          }}
          className={secondaryButtonClass}
        >
          {ctas.directionsLabel}
        </button>
      ) : null}

      {transferUrl ? (
        <button
          type="button"
          onClick={() => {
            trackEvent('walk_to_destination_clicked', {
              accessToken: props.accessToken,
              eventProperties: buildAnalyticsMetadata(props, 'parking_transfer'),
            });
            trackEvent('directions_clicked', {
              accessToken: props.accessToken,
              eventProperties: buildAnalyticsMetadata(props, 'parking_to_terminal'),
            });
            openTrackedUrl(
              transferUrl,
              buildTracking('parking_to_terminal', transferUrl, props),
              props.accessToken,
            );
          }}
          className={secondaryButtonClass}
        >
          {transferLabel}
        </button>
      ) : null}

      <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{AFFILIATE_DISCLOSURE}</p>
    </div>
  );
}

export { AFFILIATE_DISCLOSURE };
