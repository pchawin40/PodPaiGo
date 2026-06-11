"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ParkingGoogleReview, ParkingOption } from "../../lib/types";
import {
    GOOGLE_LISTING_NOT_FOUND_MESSAGE,
    GOOGLE_REVIEWS_CAP_EXCEEDED_MESSAGE,
    GOOGLE_REVIEWS_NOT_AVAILABLE_MESSAGE,
    GOOGLE_REVIEWS_SAFE_MODE_MESSAGE,
    SHOWING_CACHED_PROVIDER_DATA_MESSAGE,
} from "../../lib/parking/googlePlacesSafeMode";
import { getOptionButtonClass } from "../../lib/ui/optionClasses";
import GoogleMapsAttribution from "./GoogleMapsAttribution";

type SortMode = "most_relevant" | "newest" | "highest" | "lowest";

type ReviewsApiResponse = {
    reviews?: ParkingGoogleReview[];
    source?: string;
    message?: string;
    liveReviewsEnabled?: boolean;
    placeId?: string;
    googlePlaceId?: string;
    rating?: number;
    reviewCount?: number;
    googleMapsUri?: string;
    googleMapsUrl?: string;
    place?: {
        placeId?: string;
        googlePlaceId?: string;
        name?: string;
        rating?: number;
        reviewCount?: number;
        address?: string;
        googleMapsUri?: string;
        googleMapsUrl?: string;
    } | null;
};

const GOOGLE_REVIEW_SUMMARY_ONLY_MESSAGE =
    "Google rating summary is available, but individual review text was not returned for this listing.";

function stars(rating?: number) {
    const value = Math.round(rating ?? 0);
    return "★★★★★".slice(0, value) + "☆☆☆☆☆".slice(0, 5 - value);
}

function googleReviewsUrl(placeId?: string, googleMapsUri?: string) {
    if (googleMapsUri) return googleMapsUri;
    if (!placeId) return null;

    return `https://www.google.com/maps/search/?api=1&query=Google%20reviews&query_place_id=${encodeURIComponent(placeId)}`;
}

function reviewerInitials(review: ParkingGoogleReview): string {
    const name = review.displayName || review.authorName || "Google reviewer";
    const parts = name
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return (parts[0]?.[0] || "G").toUpperCase();
}

const REVIEWER_AVATAR_STYLES = [
    "border-slate-700/60 bg-gradient-to-br from-slate-900 to-blue-700 text-slate-50",
    "border-indigo-700/60 bg-gradient-to-br from-indigo-950 to-cyan-700 text-indigo-50",
    "border-blue-700/60 bg-gradient-to-br from-blue-950 to-teal-700 text-blue-50",
    "border-violet-700/60 bg-gradient-to-br from-violet-950 to-slate-700 text-violet-50",
    "border-emerald-700/60 bg-gradient-to-br from-slate-900 to-emerald-700 text-emerald-50",
];

function reviewerAvatarStyle(review: ParkingGoogleReview): string {
    const name = review.displayName || review.authorName || review.id || "Google reviewer";
    let hash = 0;

    for (let index = 0; index < name.length; index += 1) {
        hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
    }

    return REVIEWER_AVATAR_STYLES[hash % REVIEWER_AVATAR_STYLES.length];
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
    onGoogleMapsReviewsClick,
}: {
    parking: ParkingOption | null;
    open: boolean;
    onClose: () => void;
    airportCode?: string | null;
    onResolvedParking?: (parking: ParkingOption) => void;
    onGoogleMapsReviewsClick?: (parking: ParkingOption) => void;
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

                if (process.env.NODE_ENV !== "test") {
                    console.log("[ParkingReviewsModal data]", {
                        placeId:
                            data?.placeId ||
                            data?.googlePlaceId ||
                            data?.place?.placeId ||
                            data?.place?.googlePlaceId ||
                            parking.googlePlaceId ||
                            null,
                        rating: data?.rating ?? data?.place?.rating ?? null,
                        reviewCount: data?.reviewCount ?? data?.place?.reviewCount ?? null,
                        reviewsLength: data?.reviews?.length ?? 0,
                        data,
                    });
                }

                const enriched: ParkingOption = {
                    ...parking,
                    googlePlaceId:
                        data.place?.googlePlaceId ||
                        data.googlePlaceId ||
                        data.placeId ||
                        parking.googlePlaceId,
                    googleMapsUri:
                        data.place?.googleMapsUri ||
                        data.place?.googleMapsUrl ||
                        data.googleMapsUri ||
                        data.googleMapsUrl ||
                        parking.googleMapsUri,
                    reviewScore:
                        typeof data.rating === "number"
                            ? data.rating
                            : typeof data.place?.rating === "number"
                              ? data.place.rating
                            : parking.reviewScore,
                    reviewCount:
                        typeof data.reviewCount === "number"
                            ? data.reviewCount
                            : typeof data.place?.reviewCount === "number"
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
                    setReviewMessage(GOOGLE_REVIEWS_SAFE_MODE_MESSAGE);
                    setReviewSource("disabled");
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
            ? SHOWING_CACHED_PROVIDER_DATA_MESSAGE
            : null;
    const hasRatingSummary =
        typeof resolvedParking.reviewScore === "number" ||
        (typeof resolvedParking.reviewCount === "number" && resolvedParking.reviewCount > 0);

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
                                className={getOptionButtonClass(sort === key, {
                                    compact: true,
                                    className: "rounded-full font-medium",
                                })}
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
                            {reviewMessage || GOOGLE_REVIEWS_SAFE_MODE_MESSAGE}
                        </div>
                    )}

                    {!loadingGoogleData && reviewSource === "cap-exceeded" && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                            {reviewMessage || GOOGLE_REVIEWS_CAP_EXCEEDED_MESSAGE}
                        </div>
                    )}

                    {!loadingGoogleData && cachedReviewLabel && sortedReviews.length > 0 && (
                        <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                            {cachedReviewLabel}
                        </div>
                    )}

                    {!loadingGoogleData &&
                        !resolvedParking.googlePlaceId &&
                        reviewSource !== "disabled" &&
                        reviewSource !== "cap-exceeded" && (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                            {reviewMessage || GOOGLE_LISTING_NOT_FOUND_MESSAGE}
                        </div>
                    )}

                    {!loadingGoogleData &&
                        resolvedParking.googlePlaceId &&
                        sortedReviews.length === 0 &&
                        reviewSource !== "disabled" &&
                        reviewSource !== "cap-exceeded" &&
                        reviewSource !== "no-listing" &&
                        hasRatingSummary && (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                            {GOOGLE_REVIEW_SUMMARY_ONLY_MESSAGE}
                        </div>
                    )}

                    {!loadingGoogleData &&
                        resolvedParking.googlePlaceId &&
                        sortedReviews.length === 0 &&
                        reviewSource !== "disabled" &&
                        reviewSource !== "cap-exceeded" &&
                        reviewSource !== "no-listing" &&
                        !hasRatingSummary && (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                            {reviewMessage || GOOGLE_REVIEWS_NOT_AVAILABLE_MESSAGE}
                        </div>
                    )}

                    {!loadingGoogleData && sortedReviews.length > 0 && (
                        <div className="space-y-6">
                            {sortedReviews.map((review) => (
                                <article key={review.id} className="border-b border-zinc-200 pb-6">
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold shadow-sm ring-1 ring-black/5 ${reviewerAvatarStyle(review)}`}
                                            aria-hidden="true"
                                        >
                                            {reviewerInitials(review)}
                                        </div>

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

                <div className="space-y-2 border-t border-zinc-200 px-6 py-3">
                    <GoogleMapsAttribution className="text-xs text-zinc-600" />
                    {resolvedParking.googlePlaceId ? (
                        <a
                            href={googleReviewsUrl(
                                resolvedParking.googlePlaceId,
                                resolvedParking.googleMapsUri,
                            ) ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => onGoogleMapsReviewsClick?.(resolvedParking)}
                            className="inline-flex text-xs font-semibold text-zinc-800 underline decoration-zinc-400 underline-offset-2"
                        >
                            View all reviews on Google Maps
                        </a>
                    ) : null}
                    <p className="text-xs text-zinc-500">
                        Review text, ratings, and relative times are shown when available from Google
                        Places. Live review fetching respects safe-mode caps on Vercel.
                    </p>
                </div>
            </div>
        </div>
    );
}
