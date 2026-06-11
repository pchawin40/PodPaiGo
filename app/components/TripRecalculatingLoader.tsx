const DEFAULT_STATUS_MESSAGES = [
  'Checking route time…',
  'Comparing parking…',
  'Looking at transit and rideshare…',
  'Checking weather…',
  'Almost there…',
];

type TripRecalculatingLoaderProps = {
  title?: string;
  statusMessages?: string[];
};

export default function TripRecalculatingLoader({
  title = 'Finding the best way to go…',
  statusMessages = DEFAULT_STATUS_MESSAGES,
}: TripRecalculatingLoaderProps) {
  const messages = statusMessages.length > 0 ? statusMessages : DEFAULT_STATUS_MESSAGES;

  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="mx-auto flex w-full max-w-sm flex-col items-center rounded-3xl border border-slate-200/80 bg-white/90 px-6 py-7 text-center shadow-xl shadow-blue-950/5 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/85 dark:shadow-black/25 sm:max-w-md sm:px-8"
    >
      <style>{`
        @keyframes podpaigo-loader-car {
          0% { offset-distance: 0%; transform: rotate(-8deg); }
          45% { transform: rotate(2deg); }
          100% { offset-distance: 100%; transform: rotate(8deg); }
        }

        @keyframes podpaigo-loader-dash {
          to { stroke-dashoffset: -34; }
        }

        @keyframes podpaigo-loader-pin {
          0%, 100% { transform: scale(1); opacity: 0.45; }
          50% { transform: scale(1.35); opacity: 0.15; }
        }

        @keyframes podpaigo-loader-status {
          0%, 14% { opacity: 1; transform: translateY(0); }
          19%, 100% { opacity: 0; transform: translateY(-0.35rem); }
        }

        .podpaigo-loader-car {
          offset-path: path('M 28 92 C 74 20, 142 28, 184 84 C 210 118, 242 102, 272 48');
          offset-rotate: auto;
          animation: podpaigo-loader-car 2.8s ease-in-out infinite;
        }

        .podpaigo-loader-route {
          animation: podpaigo-loader-dash 1.8s linear infinite;
        }

        .podpaigo-loader-pin-pulse {
          transform-origin: center;
          animation: podpaigo-loader-pin 1.8s ease-in-out infinite;
        }

        .podpaigo-loader-status {
          animation: podpaigo-loader-status 8s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .podpaigo-loader-car,
          .podpaigo-loader-route,
          .podpaigo-loader-pin-pulse,
          .podpaigo-loader-status {
            animation: none !important;
          }

          .podpaigo-loader-car {
            offset-distance: 58%;
          }

          .podpaigo-loader-status:not(:first-child) {
            display: none;
          }

          .podpaigo-loader-status:first-child {
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <div
        className="relative h-32 w-full max-w-xs overflow-hidden"
        data-testid="podpaigo-route-loader"
        data-reduced-motion-safe="true"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 300 150"
          className="h-full w-full"
          role="img"
        >
          <defs>
            <linearGradient id="podpaigo-loader-route-gradient" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="55%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
            <filter id="podpaigo-loader-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.14" />
            </filter>
          </defs>

          <path
            d="M 28 92 C 74 20, 142 28, 184 84 C 210 118, 242 102, 272 48"
            fill="none"
            stroke="currentColor"
            strokeDasharray="5 10"
            strokeLinecap="round"
            strokeWidth="6"
            className="podpaigo-loader-route text-blue-300/80 dark:text-sky-400/55"
          />
          <circle cx="272" cy="48" r="19" className="podpaigo-loader-pin-pulse fill-emerald-400/45" />
          <path
            d="M272 22c-13 0-23 10-23 23 0 17 23 41 23 41s23-24 23-41c0-13-10-23-23-23Zm0 33a10 10 0 1 1 0-20 10 10 0 0 1 0 20Z"
            className="fill-emerald-500 dark:fill-emerald-400"
            filter="url(#podpaigo-loader-soft-shadow)"
          />
        </svg>

        <div className="podpaigo-loader-car absolute left-0 top-0 flex h-11 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 via-blue-600 to-blue-700 text-white shadow-lg shadow-blue-950/20">
          <svg aria-hidden="true" viewBox="0 0 48 32" className="h-8 w-11">
            <path
              d="M10 20h28l-4.3-8.2A5 5 0 0 0 29.2 9H18.8a5 5 0 0 0-4.5 2.8L10 20Z"
              fill="white"
              opacity="0.96"
            />
            <path d="M17 13h7v6H14.2l2.8-6Zm9 0h3.5c1.1 0 2.2.6 2.7 1.6L34.5 19H26v-6Z" fill="#bfdbfe" />
            <circle cx="16" cy="23" r="3.4" fill="#0f172a" />
            <circle cx="32" cy="23" r="3.4" fill="#0f172a" />
            <circle cx="16" cy="23" r="1.2" fill="#f8fafc" />
            <circle cx="32" cy="23" r="1.2" fill="#f8fafc" />
          </svg>
        </div>
      </div>

      <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
        {title}
      </div>
      <div className="relative mt-2 min-h-5 w-full overflow-hidden text-sm text-slate-600 dark:text-slate-300">
        {messages.map((message, index) => (
          <div
            key={message}
            className="podpaigo-loader-status absolute inset-x-0 top-0 opacity-0"
            style={{ animationDelay: `${index * 1.6}s` }}
          >
            {message}
          </div>
        ))}
      </div>
    </section>
  );
}
