'use client';

import {
  AFFILIATE_DISCLOSURE,
  buildParkingMonetizationCtas,
  type OutboundClickPayload,
} from '../../lib/monetization/outboundClickTypes';
import {
  appendClickCorrelationToOutboundUrl,
  extractSanitizedTargetHost,
} from '../../lib/monetization/providerUrls';
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
  priceSource?: string | null;
  driveToLotMinutes?: number | null;
  walkMinutes?: number | null;
  tripId?: string | null;
  accessToken?: string | null;
  affiliateAttached?: boolean;
  outboundSubIdParam?: string | null;
  compact?: boolean;
  onReserve?: () => void;
  reserveLabel?: string;
  viewProviderLabel?: string;
  infoOnlyBooking?: boolean;
  showPrimaryActions?: boolean;
  showTransferAction?: boolean;
  showDisclosure?: boolean;
};

function createOutboundClickId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return `ppg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function finalizeTrackedOutboundUrl(
  url: string | null,
  props: ParkingProviderActionsProps,
  clickId: string,
): string | null {
  if (!url) return null;

  const { url: trackedUrl } = appendClickCorrelationToOutboundUrl(
    url,
    {
      provider: props.provider,
      airportCode: props.airportCode,
      tripType: props.tripType,
      parkingLotId: props.parkingLotId,
      clickId,
    },
    props.outboundSubIdParam,
  );

  return trackedUrl;
}

function buildTracking(
  eventType: string,
  destinationUrl: string | null,
  props: ParkingProviderActionsProps,
  clickId: string,
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
      priceSource: props.priceSource ?? undefined,
      driveToLotMinutes: props.driveToLotMinutes ?? undefined,
      walkMinutes: props.walkMinutes ?? undefined,
      affiliateAttached: props.affiliateAttached ?? false,
      targetHost: extractSanitizedTargetHost(destinationUrl),
      outboundClickId: clickId,
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
    priceSource: props.priceSource ?? undefined,
    driveToLotMinutes: props.driveToLotMinutes ?? undefined,
    walkMinutes: props.walkMinutes ?? undefined,
    affiliateAttached: props.affiliateAttached ?? undefined,
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
    viewProviderLabel: props.viewProviderLabel,
    infoOnlyBooking: props.infoOnlyBooking,
  });

  const transferUrl = props.parkingToTerminalUrl || props.parkingToDestinationUrl || null;
  const transferLabel =
    props.transferLinkLabel ||
    (props.parkingToTerminalUrl ? 'Parking to terminal' : 'Parking to destination');

  const rootClass = props.compact
    ? 'flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center'
    : 'flex w-full flex-col gap-2';
  const buttonClass = props.compact
    ? 'inline-flex min-h-10 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold sm:w-auto'
    : 'inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold';

  const secondaryButtonClass =
    buttonClass +
    ' border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

  const openProviderUrl = (url: string | null, eventType: string, ctaType: string) => {
    const clickId = createOutboundClickId();
    const trackedUrl = finalizeTrackedOutboundUrl(url, props, clickId);
    if (!trackedUrl) return;

    trackEvent('parking_cta_clicked', {
      accessToken: props.accessToken,
      eventProperties: buildAnalyticsMetadata(props, ctaType),
    });
    openTrackedUrl(
      trackedUrl,
      buildTracking(eventType, trackedUrl, props, clickId),
      props.accessToken,
    );
  };

  return (
    <div className={rootClass}>
      {props.showPrimaryActions !== false && ctas.reserveEnabled ? (
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
            const clickId = createOutboundClickId();
            const trackedUrl = finalizeTrackedOutboundUrl(ctas.reserveUrl, props, clickId);
            if (!trackedUrl) return;
            void copyTextThenOpenWithTracking(
              props.searchQuery,
              trackedUrl,
              buildTracking('reserve_parking', trackedUrl, props, clickId),
              props.accessToken,
            );
          }}
          className={buttonClass + ' bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700'}
        >
          {ctas.reserveLabel}
        </button>
      ) : props.showPrimaryActions !== false && ctas.viewProviderEnabled ? (
        <button
          type="button"
          onClick={() => openProviderUrl(ctas.viewProviderUrl, 'view_provider', 'view_provider')}
          className={secondaryButtonClass}
        >
          {ctas.viewProviderLabel}
        </button>
      ) : props.showPrimaryActions !== false ? (
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
      ) : null}

      {props.showPrimaryActions !== false && ctas.directionsEnabled ? (
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
              buildTracking('route_to_parking', ctas.directionsUrl, props, createOutboundClickId()),
              props.accessToken,
            );
          }}
          className={secondaryButtonClass}
        >
          {ctas.directionsLabel}
        </button>
      ) : null}

      {props.showTransferAction !== false && transferUrl ? (
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
              buildTracking('parking_to_terminal', transferUrl, props, createOutboundClickId()),
              props.accessToken,
            );
          }}
          className={secondaryButtonClass}
        >
          {transferLabel}
        </button>
      ) : null}

      {props.showDisclosure !== false && props.showPrimaryActions !== false ? (
        <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{AFFILIATE_DISCLOSURE}</p>
      ) : null}
    </div>
  );
}

export { AFFILIATE_DISCLOSURE };
