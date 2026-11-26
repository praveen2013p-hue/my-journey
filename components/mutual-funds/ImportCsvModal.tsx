"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface ImportResult {
  created: string[];
  skipped: string[];
  rejected: Array<{ rowNumber: number; reason: string }>;
}

interface ImportError {
  error: string;
  months?: string[];
  rejected?: Array<{ rowNumber: number; reason: string }>;
}

/** Bulk-imports a CSV (same shape `ExportCsvButton` writes) into this profile - a month that already has an entry is always skipped, never overwritten. */
export function ImportCsvModal({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFileName(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const csv = await file.text();
      const res = await fetch("/api/mutual-fund-entries/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, csv }),
      });
      const body = await res.json();
      if (!res.ok) {
        const err = body as ImportError;
        if (err.error === "duplicate_months_in_file") {
          setError(`This file has the same month more than once: ${err.months?.join(", ")}. Fix the file and try again.`);
        } else {
          setError("Couldn't import that file.");
        }
        return;
      }
      setResult(body as ImportResult);
      router.refresh();
    } catch {
      setError("Something went wrong reading that file.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel"
      >
        Import CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Import mutual fund entries">
          <div className="w-full max-w-md rounded-xl border border-border bg-panel p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Import CSV</h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                aria-label="Close"
                className="rounded-md p-1 text-muted hover:bg-panel-alt hover:text-text"
              >
                ✕
              </button>
            </div>

            <p className="mb-3 text-sm text-muted">
              Same columns as &ldquo;Export CSV&rdquo;. A month that already has an entry here is skipped, never
              overwritten.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="mb-3 w-full text-sm text-text file:mr-3 file:min-h-[36px] file:rounded-md file:border file:border-border-strong file:bg-panel-alt file:px-3 file:text-sm file:text-text"
            />

            {error && <p className="mb-3 text-sm text-neg">{error}</p>}

            {result && (
              <div className="mb-3 rounded-lg border border-border bg-panel-alt p-3 text-sm">
                <p className="text-pos">{result.created.length} month(s) imported.</p>
                {result.skipped.length > 0 && (
                  <p className="mt-1 text-muted">
                    {result.skipped.length} month(s) already had an entry, skipped: {result.skipped.join(", ")}
                  </p>
                )}
                {result.rejected.length > 0 && (
                  <div className="mt-1 text-neg">
                    <p>{result.rejected.length} row(s) rejected:</p>
                    <ul className="ml-4 list-disc">
                      {result.rejected.map((r) => (
                        <li key={r.rowNumber}>
                          Row {r.rowNumber}: {r.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="mt-1 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="min-h-[44px] rounded-lg border border-border-strong bg-panel-alt px-3.5 text-text hover:bg-panel"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={submitting || !fileName}
                className="min-h-[44px] rounded-lg border border-gold bg-gold px-3.5 font-semibold text-bg hover:bg-gold-hover disabled:opacity-60"
              >
                {submitting ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
