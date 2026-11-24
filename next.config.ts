import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Cache Components (Next 16's new default caching model) is turned off on
   * purpose: this app is a private, always-dynamic dashboard (live prices,
   * per-user auth, per-user data) where the old "nothing is cached unless you
   * opt in" model is simpler and safer. See DECISIONS.md. */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
