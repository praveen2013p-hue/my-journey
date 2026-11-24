"use client";

import { useEffect, useState } from "react";

export interface Quote {
  text: string;
  author: string | null;
}

const ROTATE_MS = 12_000;

/** BRIEF.md §3: a different quote per page load, crossfading every ~12s. */
export function LoginQuoteRotator({ quotes, initialIndex }: { quotes: Quote[]; initialIndex: number }) {
  const [index, setIndex] = useState(initialIndex);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (quotes.length <= 1) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % quotes.length);
        setVisible(true);
      }, 300);
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, [quotes.length]);

  const quote = quotes[index] ?? quotes[0];
  if (!quote) return null;

  return (
    <figure
      className="relative max-w-[760px] transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <blockquote className="m-0 font-serif text-[clamp(32px,5vw,64px)] font-medium leading-[1.12] text-[#ECE7DA]">
        {quote.text}
      </blockquote>
      <div className="mt-9 h-0.5 w-16 bg-gold" />
      {quote.author && (
        <cite className="mt-7 block text-[13px] font-semibold uppercase tracking-[0.14em] text-gold not-italic">
          {quote.author} · paraphrased
        </cite>
      )}
      <div className="mt-5 flex gap-2" aria-hidden="true">
        {quotes.slice(0, 5).map((_, i) => (
          <span
            key={i}
            className={`block h-[7px] w-[7px] rounded-full ${i === index % 5 ? "bg-gold" : "bg-border-strong"}`}
          />
        ))}
      </div>
    </figure>
  );
}
