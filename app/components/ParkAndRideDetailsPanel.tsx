import type { ParkAndRideDetailsPanel as ParkAndRideDetails } from '../../lib/parking/parkAndRideTypes';

type ParkAndRideDetailsPanelProps = {
  details: ParkAndRideDetails;
};

export default function ParkAndRideDetailsPanel({ details }: ParkAndRideDetailsPanelProps) {
  const lotCards = details.lots || [];

  return (
    <div className="space-y-4 text-xs leading-5 text-muted-foreground">
      <div className="space-y-1">
        <div className="font-semibold text-foreground">{details.lotName}</div>
        <div>
          {details.operator} · {details.address}
        </div>
      </div>

      {lotCards.length > 0 ? (
        <div className="space-y-2">
          <div className="font-semibold text-foreground">Nearby Park & Ride lots</div>
          {lotCards.map((lot) => (
            <div
              key={lot.id}
              className="rounded-lg border border-border bg-background p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-semibold text-foreground">{lot.lotName}</div>
                  <div>{lot.provider} · {lot.address}</div>
                </div>
                <div className="inline-flex w-fit rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-foreground">
                  {lot.statusLabel}
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-md bg-muted/50 px-2 py-1.5">
                  <div className="text-[11px] uppercase">Parking</div>
                  <div className="font-semibold text-foreground">
                    {lot.parkingCostDisplay || lot.costDisplay}
                  </div>
                  <div>{lot.parkingRuleSummary}</div>
                </div>
                <div className="rounded-md bg-muted/50 px-2 py-1.5">
                  <div className="text-[11px] uppercase">Transit fare</div>
                  <div className="font-semibold text-foreground">
                    {lot.transitFareDisplay}
                  </div>
                  <div>
                    Transit {lot.transitTimeDisplay} · Total {lot.totalTimeDisplay}
                  </div>
                  <div>{lot.timingBasisLabel}</div>
                  {lot.scheduleConfidenceLabel &&
                  lot.scheduleConfidenceLabel !== lot.timingBasisLabel ? (
                    <div>{lot.scheduleConfidenceLabel}</div>
                  ) : null}
                  {lot.timeDeltaLabel ? <div>{lot.timeDeltaLabel}</div> : null}
                </div>
                <div className="rounded-md bg-muted/50 px-2 py-1.5">
                  <div className="text-[11px] uppercase">Confidence</div>
                  <div className="font-semibold text-foreground">
                    {lot.confidenceLabel}
                  </div>
                  <div>
                    {lot.confidenceDescription ||
                      lot.unavailableReason ||
                      'Verify signs before parking.'}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {lot.directionsToLotUrl ? (
                  <a
                    href={lot.directionsToLotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700"
                  >
                    Route to lot
                  </a>
                ) : null}
                {lot.transitRouteUrl ? (
                  <a
                    href={lot.transitRouteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 font-semibold text-foreground hover:bg-muted"
                  >
                    Transit to destination
                  </a>
                ) : null}
                <a
                  href={lot.rulesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 font-semibold text-foreground hover:bg-muted"
                >
                  {lot.rulesLinkLabel}
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-1">
        <div className="font-semibold text-foreground">Routes served</div>
        <div>{details.routesServed.join(' · ') || 'Transit route depends on selected lot.'}</div>
      </div>

      <div className="space-y-1">
        <div className="font-semibold text-foreground">Parking rules</div>
        <div>{details.parkingRuleSummary}</div>
        {details.maxDuration ? <div>Max duration: {details.maxDuration}</div> : null}
        <div className="mt-1 text-amber-900 dark:text-amber-100">{details.verifySignsWarning}</div>
      </div>

      <div className="space-y-1">
        <div className="font-semibold text-foreground">Timing basis</div>
        <div>{details.timingBasisLabel}</div>
        {details.scheduleConfidenceLabel &&
        details.scheduleConfidenceLabel !== details.timingBasisLabel ? (
          <div>{details.scheduleConfidenceLabel}</div>
        ) : null}
      </div>

      {details.sections.map((section) => (
        <div key={section.title} className="space-y-1">
          <div className="font-semibold text-foreground">{section.title}</div>
          {section.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
