import { parseFlightInput } from '../parseFlightInput';

describe('parseFlightInput', () => {
  test('maps DL 1234 to Delta Air Lines', () => {
    const parsed = parseFlightInput('DL 1234');

    expect(parsed.airlineName).toBe('Delta Air Lines');
    expect(parsed.airlineCode).toBe('DL');
    expect(parsed.flightNumber).toBe('1234');
    expect(parsed.normalizedLabel).toBe('Delta Air Lines · DL 1234');
  });

  test.each([
    ['AS 456', 'Alaska Airlines', 'AS', '456'],
    ['UA 123', 'United Airlines', 'UA', '123'],
    ['AA 123', 'American Airlines', 'AA', '123'],
    ['WN 123', 'Southwest Airlines', 'WN', '123'],
    ['B6 123', 'JetBlue', 'B6', '123'],
    ['NK 123', 'Spirit', 'NK', '123'],
    ['F9 123', 'Frontier', 'F9', '123'],
    ['HA 123', 'Hawaiian Airlines', 'HA', '123'],
    ['AC 123', 'Air Canada', 'AC', '123'],
    ['BA 123', 'British Airways', 'BA', '123'],
    ['EK 123', 'Emirates', 'EK', '123'],
    ['QR 123', 'Qatar Airways', 'QR', '123'],
    ['NH 123', 'ANA', 'NH', '123'],
    ['JL 123', 'Japan Airlines', 'JL', '123'],
  ])('maps %s to %s', (input, airlineName, airlineCode, flightNumber) => {
    const parsed = parseFlightInput(input);

    expect(parsed.airlineName).toBe(airlineName);
    expect(parsed.airlineCode).toBe(airlineCode);
    expect(parsed.flightNumber).toBe(flightNumber);
  });
});
