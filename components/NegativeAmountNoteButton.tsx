"use client";

import { useState } from "react";

/**
 * Small "i" button that opens a popover for a one-off comment - shown
 * automatically next to a negative SIP Amount (DECISIONS.md). `onSave`
 * decides what happens to the text: hold it in local form state (Add/Edit
 * forms) or persist it immediately (the saved-row table cell).
 */
export function NegativeAmountNoteButton({
  initialValue,
  hasNote,
  onSave,
}: {
  initialValue: string;
  hasNote: boolean;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(text.trim());
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={hasNote ? "Edit comment on this negative amount" : "Add a comment explaining this negative amount"}
        title={hasNote ? "Edit comment" : "Why is this negative? Click to add a comment."}
        className={`ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold leading-none ${
          hasNote ? "border-gold bg-gold-wash text-gold-light" : "border-border-strong text-muted"
        } hover:bg-panel-alt`}
      >
        i
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 w-56 rounded-lg border border-border-strong bg-panel-alt p-2 text-left shadow-lg">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Why is this negative?"
            className="w-full rounded-md border border-border-strong bg-field px-2 py-1 text-xs text-text"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-text">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md border border-gold bg-gold px-2 py-0.5 text-xs font-semibold text-bg hover:bg-gold-hover disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
