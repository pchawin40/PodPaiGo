import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  const airport = req.nextUrl.searchParams.get("airport") || "";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!name || !apiKey) {
    return NextResponse.json({ place: null });
  }

  const query = `${name} ${airport} airport parking`;

  const url =
    "https://maps.googleapis.com/maps/api/place/textsearch/json" +
    `?query=${encodeURIComponent(query)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    return NextResponse.json({ place: null });
  }

  const json = await res.json();
  const first = json?.results?.[0];

  if (!first) {
    return NextResponse.json({ place: null });
  }

  return NextResponse.json({
    place: {
      googlePlaceId: first.place_id,
      name: first.name,
      rating: first.rating,
      reviewCount: first.user_ratings_total,
      address: first.formatted_address,
    },
  });
}