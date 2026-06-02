export function bucketDepartureTime(
  dateTime: string,
  bucketMinutes = Number(process.env.LIVE_ROUTE_BUCKET_MINUTES || 15),
): string {
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  const safeBucketMinutes =
    Number.isFinite(bucketMinutes) && bucketMinutes > 0 ? bucketMinutes : 15;
  const bucketMs = safeBucketMinutes * 60 * 1000;
  const bucketStart = Math.floor(parsed.getTime() / bucketMs) * bucketMs;

  return new Date(bucketStart).toISOString();
}
