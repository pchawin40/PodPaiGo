import { RecommendationEngine } from '../recommendationEngine';
import { TripData } from '../types';

describe('RecommendationEngine airport-specific filtering', () => {
  const seaSpecificStrings = [
    'seatac',
    'sea-tac',
    'seattle-tacoma',
    'sound transit',
    'northgate',
    'wallypark',
    'masterpark',
  ];

  const genericParkingId = 'generic-parking';
  const genericRideshareIds = ['uber', 'lyft'];

  it('should exclude SEA-specific providers for JFK airport', async () => {
    const tripData: TripData = {
      type: 'one-way-departure',
      origin: 'JFK',
      destination: 'JFK Airport',
      departureDate: '2024-07-01',
      departureTime: '12:00',
      airportCode: 'JFK',
      transportAvailability: 'all',
    };

    const rec = await RecommendationEngine.generateRecommendations(tripData);

    // Ensure no SEA-specific string in option names or source links in parking, rideshare, transit
    const combinedOptions = [...rec.parking, ...rec.rideshare, ...rec.transit];

    combinedOptions.forEach(opt => {
      const fieldsToCheck = [opt.name, opt.sourceName, opt.sourceLink, opt.mapLink];
      fieldsToCheck.forEach(field => {
        if (field) {
          const lowerField = field.toLowerCase();
          seaSpecificStrings.forEach(seaStr => {
            expect(lowerField).not.toContain(seaStr);
          });
        }
      });
    });

    // Should include generic fallback parking
    expect(rec.parking.some(p => p.id === genericParkingId)).toBe(true);

    // Should include generic rideshare Uber and Lyft
    expect(rec.rideshare.some(r => genericRideshareIds.includes(r.id))).toBe(true);
  });

  it('should include SEA-specific providers for SEA airport', async () => {
    const tripData: TripData = {
      type: 'one-way-departure',
      origin: 'SEA',
      destination: 'SeaTac Airport',
      departureDate: '2024-07-01',
      departureTime: '12:00',
      airportCode: 'SEA',
      transportAvailability: 'all',
    };

    const rec = await RecommendationEngine.generateRecommendations(tripData);

    // Expect at least one SEA-specific provider in parking or rideshare or transit
    const providerStringChecks = rec.parking.concat(rec.rideshare).concat(rec.transit);
    const foundSeaSpecific = providerStringChecks.some(opt => {
      const combinedFields = [opt.name, opt.sourceName, opt.sourceLink, opt.mapLink].filter(Boolean).join(' ').toLowerCase();
      return seaSpecificStrings.some(seaStr => combinedFields.includes(seaStr));
    });

    expect(foundSeaSpecific).toBe(true);
  });
});
