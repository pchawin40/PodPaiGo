import type { ParkAndRideDetailsPanel as ParkAndRideDetails } from '../../lib/parking/parkAndRideTypes';

type ParkAndRideDetailsPanelProps = {
  details: ParkAndRideDetails;
};

export default function ParkAndRideDetailsPanel({ details }: ParkAndRideDetailsPanelProps) {
  return (
    <div className="space-y-3 text-xs leading-5 text-muted-foreground">
      <div>
        <div className="font-semibold text-foreground">{details.lotName}</div>
        <div>{details.operator}</div>
        <div>{details.address}</div>
      </div>

      <div>
        <div className="font-semibold text-foreground">Routes served</div>
        <div>{details.routesServed.join(' · ')}</div>
      </div>

      <div>
        <div className="font-semibold text-foreground">Parking rules</div>
        <div>{details.parkingRuleSummary}</div>
        {details.maxDuration ? <div>Max duration: {details.maxDuration}</div> : null}
        <div className="mt-1 text-amber-900 dark:text-amber-100">{details.verifySignsWarning}</div>
      </div>

      {details.sections.map((section) => (
        <div key={section.title}>
          <div className="font-semibold text-foreground">{section.title}</div>
          {section.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ))}

      <a
        href={details.rulesUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex font-semibold text-primary"
      >
        Open lot rules
      </a>
    </div>
  );
}
