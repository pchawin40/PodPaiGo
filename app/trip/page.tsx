'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TripType } from '../../lib/types';

type TripFormState = {
  type: TripType;
  destination: string; // renamed from terminal
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  returnDate: string;
  returnTime: string;
  airportTripDate: string;
  airportTripTime: string;
};

export default function TripForm() {
  const router = useRouter();
  const [tripData, setTripData] = useState<TripFormState>({
    type: 'one-way-departure',
    destination: 'Central Terminal', // renamed from terminal
    departureDate: '',
    departureTime: '',
    arrivalDate: '',
    arrivalTime: '',
    returnDate: '',
    returnTime: '',
    airportTripDate: '',
    airportTripTime: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({
      type: tripData.type,
      destination: tripData.destination, // renamed from terminal
    });

    if (tripData.type === 'one-way-departure') {
      params.set('departureDate', tripData.departureDate);
      params.set('departureTime', tripData.departureTime);
    }

    if (tripData.type === 'one-way-arrival') {
      params.set('arrivalDate', tripData.arrivalDate);
      params.set('arrivalTime', tripData.arrivalTime);
    }

    if (tripData.type === 'round-trip') {
      params.set('departureDate', tripData.departureDate);
      params.set('departureTime', tripData.departureTime);
      params.set('returnDate', tripData.returnDate);
      params.set('returnTime', tripData.returnTime);
    }

    if (tripData.type === 'dropoff-pickup') {
      params.set('airportTripDate', tripData.airportTripDate);
      params.set('airportTripTime', tripData.airportTripTime);
    }

    router.push(`/results?${params.toString()}`);
  };

  const isDepartureType = tripData.type === 'one-way-departure' || tripData.type === 'round-trip';
  const isArrivalType = tripData.type === 'one-way-arrival';
  const isDropoffPickup = tripData.type === 'dropoff-pickup';

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans">
      <main className="flex-1 w-full max-w-md mx-auto py-8 px-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h1 className="text-2xl font-bold text-center mb-6 text-black dark:text-zinc-50">
            Plan your trip
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Trip type
              </label>
              <select
                value={tripData.type}
                onChange={(e) => setTripData({ ...tripData, type: e.target.value as TripType })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
              >
                <option value="one-way-departure">One-way departure</option>
                <option value="one-way-arrival">One-way arrival</option>
                <option value="round-trip">Round trip</option>
                <option value="dropoff-pickup">Drop-off / pickup</option>
              </select>
            </div>

            {(isDepartureType || isDropoffPickup) && (
              <div className="space-y-4 border-b border-gray-200 dark:border-gray-600 pb-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  {isDropoffPickup ? 'Airport trip' : 'Departure'} details
                </h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {isDropoffPickup ? 'Airport trip date' : 'Departure date'}
                  </label>
                  <input
                    type="date"
                    value={isDropoffPickup ? tripData.airportTripDate : tripData.departureDate}
                    onChange={(e) =>
                      setTripData({
                        ...tripData,
                        [isDropoffPickup ? 'airportTripDate' : 'departureDate']: e.target.value,
                      })
                    }
                    required
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {isDropoffPickup ? 'Airport trip time' : 'Departure time'}
                  </label>
                  <input
                    type="time"
                    value={isDropoffPickup ? tripData.airportTripTime : tripData.departureTime}
                    onChange={(e) =>
                      setTripData({
                        ...tripData,
                        [isDropoffPickup ? 'airportTripTime' : 'departureTime']: e.target.value,
                      })
                    }
                    required
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
                  />
                </div>
              </div>
            )}

            {isArrivalType && (
              <div className="space-y-4 border-b border-gray-200 dark:border-gray-600 pb-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Arrival details</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Arrival date
                  </label>
                  <input
                    type="date"
                    value={tripData.arrivalDate}
                    onChange={(e) => setTripData({ ...tripData, arrivalDate: e.target.value })}
                    required
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Arrival time
                  </label>
                  <input
                    type="time"
                    value={tripData.arrivalTime}
                    onChange={(e) => setTripData({ ...tripData, arrivalTime: e.target.value })}
                    required
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
                  />
                </div>
              </div>
            )}

            {tripData.type === 'round-trip' && (
              <div className="space-y-4 border-b border-gray-200 dark:border-gray-600 pb-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Return details</h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Return date
                  </label>
                  <input
                    type="date"
                    value={tripData.returnDate}
                    onChange={(e) => setTripData({ ...tripData, returnDate: e.target.value })}
                    required
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Return time
                  </label>
                  <input
                    type="time"
                    value={tripData.returnTime}
                    onChange={(e) => setTripData({ ...tripData, returnTime: e.target.value })}
                    required
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Terminal
              </label>
              <select
                value={tripData.destination} // renamed from terminal
                onChange={(e) => setTripData({ ...tripData, destination: e.target.value })} // renamed from terminal
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
              >
                <option value="Central Terminal">Central Terminal</option>
                <option value="North Satellite">North Satellite</option>
                <option value="South Satellite">South Satellite</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Get Recommendations
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
