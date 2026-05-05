export default function InlinePriceLoading() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
      Checking APR price…
    </span>
  );
}