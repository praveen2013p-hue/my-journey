"use client";

import { useEffect } from "react";
import type { Theme } from "@/lib/db/schema-types";

/**
 * Reconciles <html data-theme> with the signed-in user's saved preference
 * (lib/db/settings.ts) - e.g. after signing in on a new device where the
 * `mj_theme` cookie doesn't match the DB yet. A plain effect, not a raw
 * `<script>` tag: Next 16's dev overlay flags inline scripts inside React
 * components ("never executed when rendering on the client"), and a
 * client component also actually re-runs this on every client-side
 * navigation, where a once-per-request script tag wouldn't.
 */
export function SyncThemeFromSettings({ theme }: { theme: Theme }) {
  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      document.cookie = `mj_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // ignore - worst case the root layout's cookie-based guess stands.
    }
  }, [theme]);

  return null;
}
