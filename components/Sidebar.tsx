"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BreakoutsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  JournalIcon,
  MenuIcon,
  PullbacksIcon,
  SectorsIcon,
  SettingsIcon,
  ThemeIcon,
  WeeklyReviewIcon,
} from "./icons";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/breakouts", label: "Breakouts", Icon: BreakoutsIcon },
  { href: "/pullbacks", label: "Pullbacks", Icon: PullbacksIcon },
  { href: "/sectors", label: "Sectors", Icon: SectorsIcon },
  { href: "/journal", label: "Journal", Icon: JournalIcon },
  { href: "/review", label: "Weekly Review", Icon: WeeklyReviewIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

const COLLAPSE_STORAGE_KEY = "mj.sidebar.collapsed";

interface SidebarProps {
  siteName: string;
  email: string;
  regime: { india: "green" | "amber" | "red" | null; us: "green" | "amber" | "red" | null };
}

function regimeDotClass(status: "green" | "amber" | "red" | null): string {
  if (status === "green") return "bg-pos";
  if (status === "amber") return "bg-warn";
  if (status === "red") return "bg-neg";
  return "bg-border-strong";
}

export function Sidebar({ siteName, email, regime }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
    } catch {
      // localStorage unavailable (private window etc.) - default to expanded.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const nav = (
    <>
      <div className="flex items-center justify-between px-2">
        <span
          className={`font-serif text-[28px] font-semibold text-gold transition-opacity ${collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}`}
        >
          {siteName}
        </span>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden md:flex items-center justify-center rounded-md p-1 text-muted hover:bg-panel-alt hover:text-text"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </div>

      <div
        className={`flex flex-col gap-1.5 rounded-[10px] border border-border bg-panel-alt p-2.5 text-xs text-muted ${collapsed ? "items-center px-1" : ""}`}
        aria-label="Market regime"
      >
        {collapsed ? (
          <div className="flex items-center gap-1.5 py-1">
            <span className={`inline-block h-[9px] w-[9px] rounded-full ${regimeDotClass(regime.india)}`} />
            <span className={`inline-block h-[9px] w-[9px] rounded-full ${regimeDotClass(regime.us)}`} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span>India</span>
              <span className="flex items-center gap-2 text-text">
                <span className={`inline-block h-[9px] w-[9px] rounded-full ${regimeDotClass(regime.india)}`} />
                {regime.india ? "Stage 2" : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>US</span>
              <span className="flex items-center gap-2 text-text">
                <span className={`inline-block h-[9px] w-[9px] rounded-full ${regimeDotClass(regime.us)}`} />
                {regime.us ? "Stage 3" : "—"}
              </span>
            </div>
          </>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors ${
                collapsed ? "justify-center px-2.5" : ""
              } ${isActive ? "bg-gold-wash text-gold-light" : "text-muted hover:bg-panel-alt hover:text-text"}`}
              onClick={() => setMobileOpen(false)}
            >
              <Icon />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={`flex flex-col gap-2 px-1.5 text-sm text-muted ${collapsed ? "items-center" : ""}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-panel-alt font-semibold text-gold-light">
            {email.charAt(0).toUpperCase()}
          </span>
          {!collapsed && <span className="min-w-0 truncate">{email}</span>}
        </div>
        <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}>
          <ThemeToggleButton compact={collapsed} />
          <SignOutButton compact={collapsed} />
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-sidebar px-4 py-3 md:hidden">
        <span className="font-serif text-xl font-semibold text-gold">{siteName}</span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 text-muted hover:bg-panel-alt"
        >
          <MenuIcon />
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-50 flex h-full w-[260px] flex-col gap-5 bg-sidebar p-4">
            {nav}
          </aside>
        </div>
      )}

      <aside
        className={`hidden md:flex md:flex-col md:gap-5 border-r border-border bg-sidebar p-4 transition-[flex-basis] ${
          collapsed ? "md:basis-[68px] md:px-2.5" : "md:basis-[232px]"
        } flex-shrink-0`}
      >
        {nav}
      </aside>
    </>
  );
}

function ThemeToggleButton({ compact }: { compact: boolean }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme((document.documentElement.getAttribute("data-theme") as "dark" | "light") ?? "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      document.cookie = `mj_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // ignore
    }
    fetch("/api/settings/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {
      // best-effort; the cookie + DOM update already give instant feedback
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch theme"
      className={`flex min-h-[40px] items-center justify-center rounded-md border border-border-strong bg-panel-alt px-2.5 text-muted hover:bg-panel ${compact ? "mt-1" : "ml-auto"}`}
    >
      <ThemeIcon />
    </button>
  );
}

function SignOutButton({ compact }: { compact?: boolean }) {
  return (
    <form action="/api/auth/sign-out" method="POST" className={compact ? "mt-1" : ""}>
      <button
        type="submit"
        className="min-h-[40px] rounded-md border border-border-strong bg-panel-alt px-2.5 text-xs font-medium text-muted hover:bg-panel hover:text-text"
      >
        Sign out
      </button>
    </form>
  );
}
