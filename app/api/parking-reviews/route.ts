import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "../../../lib/supabase/client";

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get("placeId");

  if (!placeId) {
    return NextResponse.json(
      { error: "Missing placeId" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return NextResponse.json({
      reviews: [],
      sourceName: "Unavailable",
    });
  }

  const { data, error } = await supabase
    .from("parking_lot_reviews")
    .select(
      "id, google_place_id, lot_name, author_name, rating, relative_time_description, text, profile_photo_url, review_time, source_name"
    )
    .eq("google_place_id", placeId)
    .order("review_time", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { error: "Could not load reviews" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    reviews: data ?? [],
    sourceName: "Google Places cached reviews",
  });
}