import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "../../../lib/supabase/client";

type GoogleReview = {
    author_name?: string;
    rating?: number;
    relative_time_description?: string;
    text?: string;
    profile_photo_url?: string;
    time?: number;
};

async function fetchGoogleReviews(
    placeId: string,
    sort: string
) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) return [];

    const url =
        "https://maps.googleapis.com/maps/api/place/details/json" +
        `?place_id=${encodeURIComponent(placeId)}` +
        `&fields=name,rating,user_ratings_total,reviews` +
        `&reviews_sort=${sort === "newest" ? "newest" : "most_relevant"}` +
        `&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
        cache: "no-store",
    });

    if (!res.ok) return [];

    const json = await res.json();

    console.log("Google Places Details debug", {
        status: json.status,
        error_message: json.error_message,
        name: json?.result?.name,
        rating: json?.result?.rating,
        reviewCount: json?.result?.user_ratings_total,
        reviewsReturned: json?.result?.reviews?.length ?? 0,
    });

    const reviews: GoogleReview[] =
        json?.result?.reviews ?? [];

    return reviews.map((review, index) => ({
        id: `${placeId}-${review.time ?? index}`,
        google_place_id: placeId,
        lot_name: json?.result?.name ?? null,
        author_name: review.author_name ?? null,
        rating: review.rating ?? null,
        relative_time_description:
            review.relative_time_description ?? null,
        text: review.text ?? null,
        profile_photo_url:
            review.profile_photo_url ?? null,
        review_time: review.time
            ? new Date(review.time * 1000).toISOString()
            : null,
        source_name: "Google Places",
    }));
}

export async function GET(req: NextRequest) {
    const placeId =
        req.nextUrl.searchParams.get("placeId");

    if (!placeId) {
        return NextResponse.json({
            reviews: [],
        });
    }

    const sort =
        req.nextUrl.searchParams.get("sort") ||
        "most_relevant";

    const supabase = getSupabaseClient();

    // 1. Try cached Supabase reviews first
    if (supabase) {
        const { data } = await supabase
            .from("parking_lot_reviews")
            .select(
                `
        id,
        google_place_id,
        lot_name,
        author_name,
        rating,
        relative_time_description,
        text,
        profile_photo_url,
        review_time,
        source_name
        `
            )
            .eq("google_place_id", placeId)
            .order("review_time", {
                ascending: false,
            })
            .limit(20);

        if (data && data.length > 0) {
            return NextResponse.json({
                reviews: data,
                source: "supabase-cache",
            });
        }
    }

    // 2. Fallback to Google Places
    const googleReviews =
        await fetchGoogleReviews(placeId, sort);

    // 3. Cache into Supabase
    if (
        supabase &&
        googleReviews.length > 0
    ) {
        try {
            await supabase
                .from("parking_lot_reviews")
                .insert(googleReviews);
        } catch (e) {
            console.error(
                "Failed to cache Google reviews",
                e
            );
        }
    }

    return NextResponse.json({
        reviews: googleReviews,
        source: "google-places",
        debug: {
            placeId,
            count: googleReviews.length,
        },
    });
}