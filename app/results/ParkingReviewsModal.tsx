"use client";

import { useEffect, useState } from "react";
import { ParkingOption } from "../../lib/types";

type Review = {
  id: string;
  author_name?: string;
  rating?: number;
  relative_time_description?: string;
  text?: string;
  profile_photo_url?: string;
  source_name?: string;
};

export default function ParkingReviewsModal({
  parking,
  open,
  onClose,
}: {
  parking: ParkingOption | null;
  open: boolean;
  onClose: () => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !parking?.googlePlaceId) return;

    setLoading(true);

    fetch(`/api/parking-reviews?placeId=${encodeURIComponent(parking.googlePlaceId)}`)
      .then((res) => res.json())
      .then((data) => setReviews(data.reviews ?? []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [open, parking?.googlePlaceId]);

  if (!open || !parking) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="border-b border-zinc-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-zinc-900">
                Google reviews
              </h2>
              <p className="mt-1 text-sm text-zinc-600">{parking.name}</p>

              {(parking.reviewScore || parking.reviewCount) && (
                <p className="mt-2 text-sm font-medium text-zinc-800">
                  ⭐ {parking.reviewScore ?? "—"}{" "}
                  {parking.reviewCount ? `(${parking.reviewCount.toLocaleString()} reviews)` : ""}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-5">
          {loading && (
            <div className="text-sm text-zinc-600">Loading reviews...</div>
          )}

          {!loading && reviews.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              No cached reviews available yet. The rating summary can still be
              used as a trust signal.
            </div>
          )}

          {!loading && reviews.length > 0 && (
            <div className="space-y-4">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-zinc-900">
                        {review.author_name || "Google reviewer"}
                      </div>
                      <div className="mt-1 text-sm text-zinc-500">
                        ⭐ {review.rating ?? "—"} ·{" "}
                        {review.relative_time_description || review.source_name || "Google Places"}
                      </div>
                    </div>
                  </div>

                  {review.text && (
                    <p className="mt-3 text-sm leading-6 text-zinc-700">
                      {review.text}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}