import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "My Journey",
  description: "Private swing-trading workspace for Praveen and his wife.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Fast, non-authoritative theme guess from the cookie the toggle sets
  // client-side, so there's no flash on reload. The (app) layout syncs this
  // against the signed-in user's saved preference once it has a session.
  const cookieStore = await cookies();
  const theme = cookieStore.get("mj_theme")?.value === "light" ? "light" : "dark";

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${inter.variable} ${cormorant.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
