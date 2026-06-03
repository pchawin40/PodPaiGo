"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ParkingGoogleReview, ParkingOption } from "../../lib/types";

type SortMode = "most_relevant" | "newest" | "highest" | "lowest";

type ReviewsApiResponse = {
    reviews?: ParkingGoogleReview[];
    source?: string;
    message?: string;
    liveReviewsEnabled?: boolean;
    place?: {
        googlePlaceId?: string;
        name?: string;
        rating?: number;
        reviewCount?: number;
        address?: string;
    } | null;
};

function stars(rating?: number) {
    const value = Math.round(rating ?? 0);
    return "★★★★★".slice(0, value) + "☆☆☆☆☆".slice(0, 5 - value);
}

function googleReviewsUrl(placeId?: string) {
    if (!placeId) return null;

    return `https://www.google.com/maps/search/?api=1&query=Google%20reviews&query_place_id=${encodeURIComponent(placeId)}`;
}

function parkingReviewKey(parking: ParkingOption | null, airportCode?: string | null): string {
    if (!parking) return "";

    return [
        airportCode || "UNKNOWN",
        parking.providerLotId || parking.id,
        parking.name,
        parking.address || parking.normalizedAddress || parking.routeDestination || "",
    ].join("|");
}

function buildReviewQuery(parking: ParkingOption, airportCode?: string | null): URLSearchParams {
    const params = new URLSearchParams();
    if (parking.googlePlaceId) params.set("placeId", parking.googlePlaceId);
    params.set("name", parking.name);
    if (airportCode) params.set("airport", airportCode);
    const address = parking.address || parking.normalizedAddress || parking.routeDestination;
    if (address) params.set("address", address);
    return params;
}

export default function ParkingReviewsModal({
    parking,
    open,
    onClose,
    airportCode,
    onResolvedParking,
}: {
    parking: ParkingOption | null;
    open: boolean;
    onClose: () => void;
    airportCode?: string | null;
    onResolvedParking?: (parking: ParkingOption) => void;
}) {
    const [sort, setSort] = useState<SortMode>("most_relevant");
    const parkingKey = parkingReviewKey(parking, airportCode);
    const [resolvedParkingState, setResolvedParkingState] = useState<{
        key: string;
        parking: ParkingOption | null;
    }>({ key: "", parking: null });
    const resolvedParking =
        resolvedParkingState.key === parkingKey ? resolvedParkingState.parking : parking;
    const [loadingGoogleData, setLoadingGoogleData] = useState(false);
    const [reviewSource, setReviewSource] = useState<string | null>(null);
    const [reviewMessage, setReviewMessage] = useState<string | null>(null);
    const modalFetchAttemptedKeysRef = useRef(new Set<string>());
    const onResolvedParkingRef = useRef(onResolvedParking);

    const reviews = useMemo(
        () => (resolvedParking?.googleReviews ?? []) as ParkingGoogleReview[],
        [resolvedParking?.googleReviews]
    );

    const sortedReviews = useMemo(() => {
        const copy = [...reviews];

        if (sort === "newest") {
            return copy.sort((a, b) => {
                const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
                const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;

                if (aTime !== bTime) return bTime - aTime;
                return (b.rating ?? 0) - (a.rating ?? 0);
            });
        }

        if (sort === "highest") {
            return copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        }

        if (sort === "lowest") {
            return copy.sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0));
        }

        return copy;
    }, [reviews, sort]);

    useEffect(() => {
        onResolvedParkingRef.current = onResolvedParking;
    }, [onResolvedParking]);

    useEffect(() => {
        let cancelled = false;

        async function loadGoogleData() {
            if (!open || !parking) return;

            const hasCompleteGoogleData =
                !!parking.googlePlaceId &&
                typeof parking.reviewScore === "number" &&
                typeof parking.reviewCount === "number" &&
                Array.isArray(parking.googleReviews) &&
                parking.googleReviews.length > 0;

            if (hasCompleteGoogleData) {
                setReviewSource("embedded");
                setReviewMessage(null);
                return;
            }

            const attemptKey = parkingReviewKey(parking, airportCode);

            if (modalFetchAttemptedKeysRef.current.has(attemptKey)) {
                return;
            }

            modalFetchAttemptedKeysRef.current.add(attemptKey);
            setLoadingGoogleData(true);
            setReviewSource(null);
            setReviewMessage(null);

            try {
                const params = buildReviewQuery(parking, airportCode);
                const response = await fetch(`/api/parking-reviews?${params.toString()}`);
                const data = (await response.json()) as ReviewsApiResponse;

                if (cancelled) return;

                const enriched: ParkingOption = {
                    ...parking,
                    googlePlaceId: data.place?.googlePlaceId || parking.googlePlaceId,
                    reviewScore:
                        typeof data.place?.rating === "number"
                            ? data.place.rating
                            : parking.reviewScore,
                    reviewCount:
                        typeof data.place?.reviewCount === "number"
                            ? data.place.reviewCount
                            : parking.reviewCount,
                    googleReviews: data.reviews?.length ? data.reviews : parking.googleReviews,
                };

                setResolvedParkingState({ key: attemptKey, parking: enriched });
                onResolvedParkingRef.current?.(enriched);
                setReviewSource(data.source || null);
                setReviewMessage(data.message || null);
            } catch {
                if (!cancelled) {
                    setReviewMessage("Reviews unavailable while live Google review fetching is disabled.");
                    setReviewSource("error");
                }
            } finally {
                if (!cancelled) {
                    setLoadingGoogleData(false);
                }
            }
        }

        void loadGoogleData();

        return () => {
            cancelled = true;
        };
    }, [airportCode, open, parking]);

    if (!open || !resolvedParking) return null;

    const cachedReviewLabel =
        reviewSource === "supabase-cache" || reviewSource === "stale-fallback"
            ? "Cached review data"
            : null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4">
            <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
                <div className="border-b border-zinc-200 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-semibold text-zinc-900">
                                {resolvedParking.name}
                            </h2>

                            {resolvedParking.normalizedAddress && (
                                <p className="mt-1 text-sm text-zinc-500">
                                    {resolvedParking.normalizedAddress}
                                </p>
                            )}

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <span className="text-3xl font-medium text-zinc-700">
                                    {typeof resolvedParking.reviewScore === "number"
                                        ? resolvedParking.reviewScore.toFixed(1)
                                        : "—"}
                                </span>

                                <span className="text-xl text-amber-500">
                                    {stars(resolvedParking.reviewScore)}
                                </span>

                                {typeof resolvedParking.reviewCount === "number" && (
                                    <span className="text-sm text-zinc-600">
                                        {resolvedParking.reviewCount.toLocaleString()} reviews
                                    </span>
                                )}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                            Close
                        </button>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                        {[
                            ["most_relevant", "Most relevant"],
                            ["newest", "Newest"],
                            ["highest", "Highest rating"],
                            ["lowest", "Lowest rating"],
                        ].map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setSort(key as SortMode)}
                                className={
                                    "rounded-full border px-4 py-2 text-sm font-medium " +
                                    (sort === key
                                        ? "border-blue-200 bg-blue-100 text-blue-800"
                                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50")
                                }
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {loadingGoogleData && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-900">
                            Loading cached Google reviews...
                        </div>
                    )}

                    {!loadingGoogleData && reviewSource === "disabled" && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                            Reviews disabled in safe mode
                            {reviewMessage ? ` — ${reviewMessage}` : ""}
                        </div>
                    )}

                    {!loadingGoogleData && cachedReviewLabel && sortedReviews.length > 0 && (
                        <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                            {cachedReviewLabel}
                        </div>
                    )}

                    {!loadingGoogleData && !resolvedParking.googlePlaceId && (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                            Google listing is not connected for this lot yet.
                        </div>
                    )}

                    {!loadingGoogleData &&
                        resolvedParking.googlePlaceId &&
                        sortedReviews.length === 0 &&
                        reviewSource !== "disabled" && (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                            {reviewMessage ||
                                "Reviews unavailable while live Google review fetching is disabled."}
                        </div>
                    )}

                    {!loadingGoogleData && sortedReviews.length > 0 && (
                        <div className="space-y-6">
                            {sortedReviews.map((review) => (
                                <article key={review.id} className="border-b border-zinc-200 pb-6">
                                    <div className="flex items-start gap-3">
                                        {review.profilePhotoUrl ? (
                                            <img
                                                src={review.profilePhotoUrl}
                                                alt=""
                                                className="h-10 w-10 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200 text-sm font-bold text-zinc-700">
                                                {(review.displayName || review.authorName || "G").slice(0, 1)}
                                            </div>
                                        )}

                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold text-zinc-900">
                                                {review.displayName || review.authorName || "Google reviewer"}
                                            </div>

                                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                                                <span className="font-medium text-amber-500">
                                                    {stars(review.rating)}
                                                </span>
                                                <span className="text-zinc-500">
                                                    {review.relativeTimeDescription || "Google review"}
                                                </span>
                                            </div>

                                            {resolvedParking.googlePlaceId && (
                                                <a
                                                    href={googleReviewsUrl(resolvedParking.googlePlaceId) ?? "#"}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-4 inline-flex rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                                                >
                                                    View all Google reviews
                                                </a>
                                            )}

                                            {review.text && (
                                                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-700">
                                                    {review.text}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-t border-zinc-200 px-6 py-3 text-xs text-zinc-500">
                    Reviews shown are from cached Google Places data when available. Live Google review
                    fetching stays disabled in safe mode.
                </div>
            </div>
        </div>
    );
}
