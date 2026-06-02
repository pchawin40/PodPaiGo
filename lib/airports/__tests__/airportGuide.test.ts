import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AIRPORT_TRIP_DISCLAIMER,
  buildAirportTripCardModel,
  getAirportGuide,
  lookupAirlineGuide,
} from '../airportGuide';
import AirportTripCard from '@/app/components/AirportTripCard';
import {
  canMakeLiveGetPlaceCall,
  canMakeLivePhotoMediaCall,
  canMakeLiveSearchTextCall,
} from '../../parking/googlePlacesGuard';

describe('airport guide static intelligence', () => {
  test('SEA Alaska lookup returns North Satellite / N Gates', () => {
    const lookup = lookupAirlineGuide('SEA', 'Alaska');

    expect(lookup).not.toBeNull();
    expect(lookup?.confidence).toBe('known');
    expect(lookup?.terminal).toBe('North Satellite');
    expect(lookup?.concourse).toBe('N Gates');
    expect(lookup?.checkInNote).toMatch(/Alaska/i);
  });

  test('unknown airline shows confirm-with-airport guidance', () => {
    const lookup = lookupAirlineGuide('SEA', 'Totally Made Up Air');

    expect(lookup).not.toBeNull();
    expect(lookup?.confidence).toBe('unknown');
    expect(lookup?.terminal).toBeNull();
    expect(lookup?.checkInNote).toMatch(/could not match/i);
    expect(lookup?.checkInNote).toMatch(/Confirm terminal/i);
    expect(lookup?.disclaimer).toBe(AIRPORT_TRIP_DISCLAIMER);
  });

  test('airport trip card model includes TSA PreCheck and CLEAR badges for SEA', () => {
    const model = buildAirportTripCardModel({
      airportCode: 'SEA',
      airlineOrFlight: 'Alaska',
      leaveByTime: '08:30',
      parkingPickName: 'WallyPark',
      checkingBags: false,
      bagPlan: 'none',
    });

    expect(model).not.toBeNull();
    expect(model?.tsaPreCheckAvailable).toBe(true);
    expect(model?.clearAvailable).toBe(true);
    expect(model?.terminalLabel).toMatch(/North Satellite/);
  });

  test('airport trip card renders companion hero labels', () => {
    const html = renderToStaticMarkup(
      React.createElement(AirportTripCard, {
        airportCode: 'SEA',
        airlineOrFlight: 'Alaska',
        leaveByTime: '08:30',
        parkingPickName: 'WallyPark',
        bagPlan: 'none',
        departureTime: '12:00',
        airportBufferMinutes: 75,
        travelMinutes: 40,
        transportMode: 'parking',
      }),
    );

    expect(html).toContain('TSA PreCheck');
    expect(html).toContain('CLEAR');
    expect(html).toContain('Airport day companion');
    expect(html).toContain('Leave home');
    expect(html).toContain('Travel checklist');
  });

  test('DL flight input resolves to Delta on card model', () => {
    const model = buildAirportTripCardModel({
      airportCode: 'SEA',
      airlineOrFlight: 'DL 1234',
      leaveByTime: '08:30',
    });

    expect(model?.airlineLabel).toBe('Delta Air Lines');
    expect(model?.normalizedFlightLabel).toContain('Delta Air Lines');
    expect(model?.airlineCode).toBe('DL');
    expect(model?.flightNumber).toBe('1234');
  });

  test('airport guide module makes zero paid API calls', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    lookupAirlineGuide('SEA', 'Delta');
    buildAirportTripCardModel({ airportCode: 'LAX', airlineOrFlight: 'United' });
    getAirportGuide('JFK');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Google Places remains disabled in safe mode', () => {
    process.env.DISABLE_GOOGLE_PLACES = 'true';
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';
    process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '0';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '0';
    process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST = '0';

    expect(canMakeLiveSearchTextCall()).toBe(false);
    expect(canMakeLiveGetPlaceCall()).toBe(false);
    expect(canMakeLivePhotoMediaCall()).toBe(false);

    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.DISABLE_GOOGLE_PARKING_DISCOVERY;
    delete process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST;
  });
});
