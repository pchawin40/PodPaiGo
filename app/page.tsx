import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-4xl flex-col items-center justify-center py-32 px-16 bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-8 text-center">
          <h1 className="text-5xl font-bold leading-tight text-black dark:text-zinc-50">
            Welcome to PodPaiGo
          </h1>
          <p className="max-w-2xl text-xl leading-8 text-zinc-600 dark:text-zinc-400">
            Your smart companion for SeaTac Airport. Get personalized recommendations for parking,
            rideshare, transit, and more to make your travel seamless.
          </p>
          <Link
            href="/trip"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Plan Your Trip
          </Link>
        </div>
      </main>
    </div>
  );
}
