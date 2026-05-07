import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "../../../lib/supabase/client";

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get("placeId");

  if (!placeId) {
    return NextResponse.json({ reviews: [] });
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ reviews: [] });
  }

  const { data, error } = await supabase
    .from("parking_lot_reviews")
    .select(
      "id, author_name, rating, relative_time_description, text, profile_photo_url, review_time, source_name"
    )
    .eq("google_place_id", placeId)
    .order("review_time", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ reviews: [] });
  }

  return NextResponse.json({ reviews: data ?? [] });
}