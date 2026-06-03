"use client";

import { useEffect, useState } from "react";

const messages = [
  "Airport trip planning without the guesswork",
  "Compare parking, rideshare, and transit in one place",
  "Timing, cost, weather, and stress — together",
  "Plan the full airport trip, not just the parking spot",
];

export default function HeroBadge() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setVisible(false);

      window.setTimeout(() => {
        setIndex((current) => (current + 1) % messages.length);
        setVisible(true);
      }, 350);
    }, 6500);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <p
      className={`mb-4 inline-flex rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-muted-foreground transition-all duration-500 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      }`}
    >
      {messages[index]}
    </p>
  );
}