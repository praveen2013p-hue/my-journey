"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StrategyTagRow } from "@/lib/db/schema-types";

export function StrategyTagsManager({ tags }: { tags: StrategyTagRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/strategy-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setName("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return;
    await fetch(`/api/strategy-tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingName }),
    });
    setEditingId(null);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this strategy tag? Trades using it will show as Untagged.")) return;
    await fetch(`/api/strategy-tags/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="p-5">
      <h3 className="mb-3.5 text-sm font-semibold text-text">Strategy tags</h3>

      <form onSubmit={handleAdd} className="mb-4 flex items-end gap-2.5">
        <div>
          <label htmlFor="new-tag-name" className="mb-1 block text-xs text-muted">
            New tag
          </label>
          <input
            id="new-tag-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="min-h-[44px] w-64 rounded-lg border border-border-strong bg-field px-3 py-2 text-text"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="min-h-[44px] rounded-lg border border-gold bg-gold px-3.5 font-semibold text-bg hover:bg-gold-hover disabled:opacity-60"
        >
          Create
        </button>
      </form>

      <ul className="flex flex-col gap-1.5">
        {tags.map((tag) => (
          <li key={tag.id} className="flex items-center gap-2.5 rounded-lg border border-border-strong bg-panel-alt px-3 py-2 text-sm">
            {editingId === tag.id ? (
              <>
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  maxLength={60}
                  className="min-h-[36px] flex-1 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
                />
                <button
                  type="button"
                  onClick={() => handleRename(tag.id)}
                  className="rounded-md border border-gold bg-gold px-2 py-1 text-xs font-semibold text-bg hover:bg-gold-hover"
                >
                  Save
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-xs text-muted hover:text-text">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate font-medium">{tag.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(tag.id);
                    setEditingName(tag.name);
                  }}
                  className="rounded-md border border-border-strong bg-panel px-2 py-1 text-xs font-medium hover:bg-panel-alt"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(tag.id)}
                  className="rounded-md border border-border-strong bg-panel px-2 py-1 text-xs font-medium text-neg hover:bg-panel-alt"
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
        {tags.length === 0 && <p className="text-sm text-muted">No strategy tags yet - create one here or while adding a trade.</p>}
      </ul>
    </div>
  );
}
