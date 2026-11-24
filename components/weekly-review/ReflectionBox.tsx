"use client";

import { useRef, useState } from "react";

export function ReflectionBox({ weekEnding, initialText }: { weekEnding: string; initialText: string }) {
  const [text, setText] = useState(initialText);
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(value: string) {
    setText(value);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/weekly-review/reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_ending: weekEnding, text: value }),
      })
        .then(() => setSaved(true))
        .catch(() => {});
    }, 700);
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5" aria-label="My reflection">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">My reflection</h2>
        <span className="text-xs text-muted">{saved ? "Saved" : "Saving…"}</span>
      </div>
      <textarea
        aria-label="My reflection for this week"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="What worked, what didn't, what you'd do differently next week…"
        className="min-h-[140px] w-full resize-y rounded-lg border border-border-strong bg-field px-3 py-2.5 text-text"
      />
    </section>
  );
}
