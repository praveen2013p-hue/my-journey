"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuoteRow } from "@/lib/db/schema-types";

export function QuotesManager({ quotes }: { quotes: QuoteRow[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/settings/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, author: author || null }),
      });
      setText("");
      setAuthor("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(id: number, active: boolean) {
    await fetch(`/api/settings/quotes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    router.refresh();
  }

  async function handleDelete(id: number) {
    if (!confirm("Remove this quote for good?")) return;
    await fetch(`/api/settings/quotes/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="p-5">
      <h3 className="mb-3.5 text-sm font-semibold text-text">
        Login page quotes ({quotes.filter((q) => q.active).length} active)
      </h3>

      <form onSubmit={handleAdd} className="mb-4 flex flex-wrap items-end gap-2.5">
        <div className="flex-1" style={{ minWidth: 220 }}>
          <label htmlFor="quote-text" className="mb-1 block text-xs text-muted">
            Quote
          </label>
          <input
            id="quote-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            className="min-h-[44px] w-full rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
          />
        </div>
        <div>
          <label htmlFor="quote-author" className="mb-1 block text-xs text-muted">
            Author (optional)
          </label>
          <input
            id="quote-author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            maxLength={100}
            className="min-h-[44px] w-48 rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="min-h-[44px] rounded-lg border border-gold bg-gold px-3.5 font-semibold text-bg hover:bg-gold-hover disabled:opacity-60"
        >
          Add
        </button>
      </form>

      {quotes.length === 0 ? (
        <p className="text-sm text-muted">No quotes yet.</p>
      ) : (
        <details className="group" open={quotes.length <= 4}>
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 rounded-lg border border-border-strong bg-panel-alt px-3 text-sm font-medium hover:bg-panel">
            <span className="transition-transform group-open:rotate-90">▸</span>
            {quotes.length} quote{quotes.length === 1 ? "" : "s"} saved —
            <span className="hidden group-open:inline">click to collapse</span>
            <span className="inline group-open:hidden">click to expand</span>
          </summary>
          <ul className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
            {quotes.map((q) => (
              <li
                key={q.id}
                className={`flex items-center gap-2.5 rounded-lg border border-border-strong px-3 py-2 text-sm ${q.active ? "bg-panel-alt" : "bg-panel-alt/40 opacity-60"}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  &ldquo;{q.text}&rdquo;{q.author && <span className="text-muted"> — {q.author}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => toggleActive(q.id, !q.active)}
                  className="rounded-md border border-border-strong bg-panel px-2 py-1 text-xs font-medium hover:bg-panel-alt"
                >
                  {q.active ? "Hide" : "Unhide"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(q.id)}
                  className="rounded-md border border-border-strong bg-panel px-2 py-1 text-xs font-medium text-neg hover:bg-panel-alt"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
