import { AirportInfo, AirportTerminalZone } from './catalog';

export function getTerminalZonesForAirport(airport: AirportInfo): AirportTerminalZone[] {
  if (airport.terminalZones?.length) {
    return airport.terminalZones;
  }

  return [
    {
      id: `${airport.id.toLowerCase()}-checkin`,
      label: 'Check-in',
      kind: 'checkin',
      level: 'Departures',
      description: 'Airline counters, kiosks, and bag drop before security.',
    },
    {
      id: `${airport.id.toLowerCase()}-security`,
      label: 'Security',
      kind: 'security',
      level: 'Departures',
      description: 'TSA/security screening before entering the gate area.',
    },
    {
      id: `${airport.id.toLowerCase()}-gates`,
      label: 'Gates / concourses',
      kind: 'gates',
      level: 'Post-security',
      description: 'Gate areas, concourses, and boarding zones.',
    },
    {
      id: `${airport.id.toLowerCase()}-baggage`,
      label: 'Baggage claim',
      kind: 'baggage',
      level: 'Arrivals',
      description: 'Baggage pickup and arrivals meetup area.',
    },
    {
      id: `${airport.id.toLowerCase()}-ground-transport`,
      label: 'Ground transport',
      kind: 'ground-transport',
      level: 'Arrivals / curbside',
      description: 'Rideshare, taxi, shuttle, pickup, and transit areas.',
    },
    {
      id: `${airport.id.toLowerCase()}-parking`,
      label: 'Parking',
      kind: 'parking',
      level: 'Garage / lots',
      description: 'Airport parking, nearby lots, and walking or shuttle routes.',
    },
  ];
}