"use client";

import { useEffect, useState } from "react";

const messages = [
  "Airport trips and city parking in one dashboard",
  "Compare driving, parking, rideshare, transit, and backups",
  "Street and meter estimates are clearly labeled",
  "Airport-day timing and city-trip choices together",
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
