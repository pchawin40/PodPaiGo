'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { TripData, Recommendation, TripType } from '../../lib/types';
import { RecommendationEngine } from '../../lib/recommendationEngine';
import { RankedRecommendation } from '../../lib/domain';

export default function ResultsContent() {
  const searchParams = useSearchParams();
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [rankedOptions, setRankedOptions] = useState<RankedRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingData, setEditingData] = useState<TripData | null>(null);

  useEffect(() => {
    const type = searchParams.get('type') as TripData['type'] | null;
    const destination = searchParams.get('destination') || ''; // renamed from terminal

    let data: TripData | null = null;

    if (type === 'one-way-departure') {
      const departureDate = searchParams.get('departureDate') || '';
      const departureTime = searchParams.get('departureTime') || '';
      if (departureDate && departureTime && destination) {
        data = { type, departureDate, departureTime, destination };
      }
    } else if (type === 'one-way-arrival') {
      const arrivalDate = searchParams.get('arrivalDate') || '';
      const arrivalTime = searchParams.get('arrivalTime') || '';
      if (arrivalDate && arrivalTime && destination) {
        data = { type, arrivalDate, arrivalTime, destination };
      }
    } else if (type === 'round-trip') {
      const departureDate = searchParams.get('departureDate') || '';
      const departureTime = searchParams.get('departureTime') || '';
      const returnDate = searchParams.get('returnDate') || '';
      const returnTime = searchParams.get('returnTime') || '';
      if (departureDate && departureTime && returnDate && returnTime && destination) {
        data = { type, departureDate, departureTime, returnDate, returnTime, destination };
      }
    } else if (type === 'dropoff-pickup') {
      const airportTripDate = searchParams.get('airportTripDate') || '';
      const airportTripTime = searchParams.get('airportTripTime') || '';
      if (airportTripDate && airportTripTime && destination) {
        data = { type, airportTripDate, airportTripTime, destination };
      }
    }

    if (data) {
      fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })
        .then(response => response.json())
        .then((rec: Recommendation) => {
          setRecommendation(rec);
          setTripData(data);

          const ranked = RecommendationEngine.getRankedRecommendations(
            data,
            rec.parking,
            rec.rideshare,
            rec.transit,
            rec.tsaEstimate
          );
          setRankedOptions(ranked);
        })
        .catch(error => {
          console.error('Error fetching recommendations:', error);
          setLoading(false);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [searchParams]);

  const handleRecalculate = async (newTripData: TripData) => {
    setLoading(true);
    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTripData),
      });
      const rec: Recommendation = await response.json();
      setRecommendation(rec);
      setTripData(newTripData);

      const ranked = RecommendationEngine.getRankedRecommendations(
        newTripData,
        rec.parking,
        rec.rideshare,
        rec.transit,
        rec.tsaEstimate
      );
      setRankedOptions(ranked);
      setIsEditing(false);
      setEditingData(null);

      // Update URL params
      const params = new URLSearchParams();
      params.set('type', newTripData.type);
      params.set('destination', newTripData.destination);

      if (newTripData.type === 'one-way-departure') {
        params.set('departureDate', newTripData.departureDate);
        params.set('departureTime', newTripData.departureTime);
      } else if (newTripData.type === 'one-way-arrival') {
        params.set('arrivalDate', newTripData.arrivalDate);
        params.set('arrivalTime', newTripData.arrivalTime);
      } else if (newTripData.type === 'round-trip') {
        params.set('departureDate', newTripData.departureDate);
        params.set('departureTime', newTripData.departureTime);
        params.set('returnDate', newTripData.returnDate);
        params.set('returnTime', newTripData.returnTime);
      } else if (newTripData.type === 'dropoff-pickup') {
        params.set('airportTripDate', newTripData.airportTripDate);
        params.set('airportTripTime', newTripData.airportTripTime);
      }

      window.history.replaceState(null, '', `/results?${params.toString()}`);
    } catch (error) {
      console.error('Error recalculating recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = () => {
    setIsEditing(true);
    setEditingData(tripData);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingData(null);
  };

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50">
        <div className="text-xl">Loading recommendations...</div>
      </div>
    );
  }

  if (!tripData || !recommendation) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50">
        <div className="text-xl text-red-600">Invalid trip data. Please go back and try again.</div>
        <Link href="/trip" className="mt-4 text-blue-600 hover:underline">Plan Trip</Link>
      </div>
    );
  }

  const cheapestOption = rankedOptions[0];
  const leastStressfulOption = rankedOptions.find(opt => opt.reasons.includes('High availability') || opt.reasons.includes('Frequent service'));

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans">
      <main className="flex-1 w-full max-w-4xl mx-auto py-4 px-4">
        {/* Trip Summary */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-2xl font-bold text-black dark:text-zinc-50">
              Trip Summary
            </h1>
            <button
              onClick={startEditing}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Edit Trip
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Trip type:</span>{' '}
              {tripData.type === 'one-way-departure' && 'One-way departure'}
              {tripData.type === 'one-way-arrival' && 'One-way arrival'}
              {tripData.type === 'round-trip' && 'Round trip'}
              {tripData.type === 'dropoff-pickup' && 'Drop-off / pickup'}
            </div>

            {'departureDate' in tripData && (
              <div>
                <span className="font-medium">Departing:</span> {tripData.departureDate} at {tripData.departureTime}
              </div>
            )}

            {'returnDate' in tripData && (
              <div>
                <span className="font-medium">Returning:</span> {tripData.returnDate} at {tripData.returnTime}
              </div>
            )}

            {'arrivalDate' in tripData && (
              <div>
                <span className="font-medium">Arriving:</span> {tripData.arrivalDate} at {tripData.arrivalTime}
              </div>
            )}

            {'airportTripDate' in tripData && (
              <div>
                <span className="font-medium">Airport trip:</span> {tripData.airportTripDate} at {tripData.airportTripTime}
              </div>
            )}

            <div>
              <span className="font-medium">Terminal:</span> {tripData.destination}
            </div>

            <div>
              <span className="font-medium">TSA Wait:</span> {recommendation.tsaEstimate.waitTime} min ({recommendation.tsaEstimate.status})
            </div>

            {recommendation.tripDuration !== undefined && (
              <div>
                <span className="font-medium">Trip length:</span> {Math.ceil(recommendation.tripDuration / 60)}h ({recommendation.tripDuration} min)
              </div>
            )}

            {recommendation.leaveByTime && (
              <div>
                <span className="font-medium">Leave by:</span> {recommendation.leaveByTime}
              </div>
            )}
          </div>
        </div>

        {/* Edit Trip Panel */}
        {isEditing && editingData && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
            <h2 className="text-xl font-bold text-black dark:text-zinc-50 mb-4">
              Edit Trip Details
            </h2>
            <EditTripForm
              initialData={editingData}
              onSubmit={handleRecalculate}
              onCancel={cancelEditing}
            />
          </div>
        )}

        {/* Best Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {cheapestOption && (
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border-l-4 border-green-500">
              <h2 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
                💰 Cheapest Option
              </h2>
              <div className="text-sm">
                <p className="font-medium">{cheapestOption.option.name}</p>
                <p className="text-green-700 dark:text-green-300">${cheapestOption.cost}</p>
                <p className="text-gray-600 dark:text-gray-400">{cheapestOption.duration} min travel</p>
              </div>
            </div>
          )}

          {leastStressfulOption && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border-l-4 border-blue-500">
              <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">
                😌 Least Stressful
              </h2>
              <div className="text-sm">
                <p className="font-medium">{leastStressfulOption.option.name}</p>
                <p className="text-blue-700 dark:text-blue-300">${leastStressfulOption.cost}</p>
                <p className="text-gray-600 dark:text-gray-400">{leastStressfulOption.duration} min travel</p>
              </div>
            </div>
          )}
        </div>

        {/* Comparison Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <h2 className="text-xl font-semibold p-4 bg-gray-50 dark:bg-gray-700 text-black dark:text-zinc-50">
            All Options Compared
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 dark:bg-gray-600">
                <tr>
                  <th className="px-4 py-2 text-left">Option</th>
                  <th className="px-4 py-2 text-left">Trust</th>
                  <th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-right">Drive Time</th>
                  <th className="px-4 py-2 text-left">Why Selected</th>
                  <th className="px-4 py-2 text-left">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {rankedOptions.map((option, index) => {
                  const opt = option.option;
                  const trustStatus = opt.trustStatus;
                  const trustColor = 
                    trustStatus === 'live' ? 'text-green-600' :
                    trustStatus === 'verified-source' ? 'text-blue-600' :
                    trustStatus === 'estimated' ? 'text-yellow-600' : 'text-red-600';

                  return (
                    <tr key={`${option.type}-${index}`} className="border-t border-gray-200 dark:border-gray-600">
                      <td className="px-4 py-3 font-medium">
                        {opt.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${trustColor}`}>
                          {trustStatus === 'live' ? '🔴 Live' :
                           trustStatus === 'verified-source' ? '🔵 Verified' :
                           trustStatus === 'estimated' ? '🟡 Estimated' : '🔴 Fallback'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        ${option.cost}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {option.duration} min
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        <ul className="list-disc list-inside space-y-1">
                          {option.reasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                          {option.type === 'parking' && (
                            <li>Full trip duration pricing</li>
                          )}
                          {option.type === 'rideshare' && (
                            <li>{tripData.type === 'round-trip' ? 'Roundtrip pricing' : 'One-way pricing'}</li>
                          )}
                          {option.type === 'transit' && (
                            <li>{tripData.type === 'round-trip' ? 'Roundtrip fare' : 'One-way fare'}</li>
                          )}
                        </ul>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        <div className="space-y-1">
                          <div><strong>Source:</strong> {opt.sourceName}</div>
                          {opt.sourceLink && (
                            <div><strong>Link:</strong> <a href={opt.sourceLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a></div>
                          )}
                          {opt.mapLink && (
                            <div><strong>Map:</strong> <a href={opt.mapLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a></div>
                          )}
                          <div><strong>Updated:</strong> {new Date(opt.lastUpdated).toLocaleDateString()}</div>
                          <div><strong>Assumptions:</strong></div>
                          <ul className="list-disc list-inside ml-4 space-y-1">
                            {opt.assumptions.map((assumption, idx) => (
                              <li key={idx}>{assumption}</li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/trip"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Plan Another Trip
          </Link>
        </div>
      </main>
    </div>
  );
}

function EditTripForm({ initialData, onSubmit, onCancel }: {
  initialData: TripData;
  onSubmit: (data: TripData) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    type: initialData.type,
    destination: initialData.destination,
    departureDate: 'departureDate' in initialData ? initialData.departureDate : '',
    departureTime: 'departureTime' in initialData ? initialData.departureTime : '',
    arrivalDate: 'arrivalDate' in initialData ? initialData.arrivalDate : '',
    arrivalTime: 'arrivalTime' in initialData ? initialData.arrivalTime : '',
    returnDate: 'returnDate' in initialData ? initialData.returnDate : '',
    returnTime: 'returnTime' in initialData ? initialData.returnTime : '',
    airportTripDate: 'airportTripDate' in initialData ? initialData.airportTripDate : '',
    airportTripTime: 'airportTripTime' in initialData ? initialData.airportTripTime : '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let data: TripData;

    if (formData.type === 'one-way-departure') {
      data = {
        type: formData.type,
        departureDate: formData.departureDate,
        departureTime: formData.departureTime,
        destination: formData.destination,
      };
    } else if (formData.type === 'one-way-arrival') {
      data = {
        type: formData.type,
        arrivalDate: formData.arrivalDate,
        arrivalTime: formData.arrivalTime,
        destination: formData.destination,
      };
    } else if (formData.type === 'round-trip') {
      data = {
        type: formData.type,
        departureDate: formData.departureDate,
        departureTime: formData.departureTime,
        returnDate: formData.returnDate,
        returnTime: formData.returnTime,
        destination: formData.destination,
      };
    } else {
      data = {
        type: formData.type,
        airportTripDate: formData.airportTripDate,
        airportTripTime: formData.airportTripTime,
        destination: formData.destination,
      };
    }

    onSubmit(data);
  };

  const isDepartureType = formData.type === 'one-way-departure' || formData.type === 'round-trip';
  const isArrivalType = formData.type === 'one-way-arrival';
  const isDropoffPickup = formData.type === 'dropoff-pickup';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Trip type
          </label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value as TripType })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
          >
            <option value="one-way-departure">One-way departure</option>
            <option value="one-way-arrival">One-way arrival</option>
            <option value="round-trip">Round trip</option>
            <option value="dropoff-pickup">Drop-off / pickup</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Terminal
          </label>
          <select
            value={formData.destination}
            onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
          >
            <option value="Central Terminal">Central Terminal</option>
            <option value="North Satellite">North Satellite</option>
            <option value="South Satellite">South Satellite</option>
          </select>
        </div>
      </div>

      {(isDepartureType || isDropoffPickup) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {isDropoffPickup ? 'Airport trip date' : 'Departure date'}
            </label>
            <input
              type="date"
              value={isDropoffPickup ? formData.airportTripDate : formData.departureDate}
              onChange={(e) =>
                setFormData({
                  ...formData,
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
              value={isDropoffPickup ? formData.airportTripTime : formData.departureTime}
              onChange={(e) =>
                setFormData({
                  ...formData,
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Arrival date
            </label>
            <input
              type="date"
              value={formData.arrivalDate}
              onChange={(e) => setFormData({ ...formData, arrivalDate: e.target.value })}
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
              value={formData.arrivalTime}
              onChange={(e) => setFormData({ ...formData, arrivalTime: e.target.value })}
              required
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
            />
          </div>
        </div>
      )}

      {formData.type === 'round-trip' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Return date
            </label>
            <input
              type="date"
              value={formData.returnDate}
              onChange={(e) => setFormData({ ...formData, returnDate: e.target.value })}
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
              value={formData.returnTime}
              onChange={(e) => setFormData({ ...formData, returnTime: e.target.value })}
              required
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-3 py-2"
            />
          </div>
        </div>
      )}

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Recalculate
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}