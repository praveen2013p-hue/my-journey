"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMarketRegimes } from "@/lib/use-regime";
import type { MutualFundProfileRow } from "@/lib/db/schema-types";
import {
  BreakoutsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  JournalIcon,
  MenuIcon,
  MutualFundIcon,
  NetWorthIcon,
  NpsIcon,
  PencilIcon,
  PerformanceIcon,
  PullbacksIcon,
  SectorsIcon,
  SettingsIcon,
  ThemeIcon,
  UsTradingCapitalIcon,
  WeeklyReviewIcon,
} from "./icons";

// Standalone "anchor" items that sit outside every section - a single
// landing page at the top, a single admin page at the bottom (DECISIONS.md:
// three segments is the right number right now - Scanner/Trading/Investment
// - and neither of these is a sibling of anything, so neither gets a label).
const DASHBOARD_ITEM = { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon };
const SETTINGS_ITEM = { href: "/settings", label: "Settings", Icon: SettingsIcon };

// "Scanner": finding new signals - pure market screening, no personal data.
const SCANNER_ITEMS = [
  { href: "/breakouts", label: "Breakouts", Icon: BreakoutsIcon },
  { href: "/pullbacks", label: "Pullbacks", Icon: PullbacksIcon },
  { href: "/sectors", label: "Sectors", Icon: SectorsIcon },
];

// "Trading": everything about the user's own trades - logging, capital,
// and reviewing results. US Trading Capital sits here (not under
// "Investment" with Mutual Funds/NPS) since it's swing-trading capital,
// not long-term investing.
const TRADING_ITEMS = [
  { href: "/journal", label: "Journal", Icon: JournalIcon },
  { href: "/us-trading-capital", label: "US Trading Capital", Icon: UsTradingCapitalIcon },
  { href: "/review", label: "Weekly Review", Icon: WeeklyReviewIcon },
  { href: "/performance", label: "Performance", Icon: PerformanceIcon },
];

const COLLAPSE_STORAGE_KEY = "mj.sidebar.collapsed";

type Stage = 1 | 2 | 3 | 4 | null;

interface SidebarProps {
  siteName: string;
  email: string;
  mutualFundProfiles: MutualFundProfileRow[];
  longTermHoldingLabel: string;
  scannerLabel: string;
  tradingLabel: string;
}

/** BRIEF.md §8: green = Stage 2, yellow = Stage 1, red = Stage 3 or 4. */
function regimeDotClass(stage: Stage): string {
  if (stage === 2) return "bg-pos";
  if (stage === 1) return "bg-stage1";
  if (stage === 3 || stage === 4) return "bg-neg";
  return "bg-border-strong";
}

function regimeLabel(stage: Stage): string {
  return stage === null ? "—" : `Stage ${stage}`;
}

/** One plain nav row - shared by every standalone item and every item inside a segment, so the active-highlight/prefetch/collapsed logic lives in exactly one place. */
function NavLink({
  item,
  collapsed,
  pathname,
  onNavigate,
}: {
  item: { href: string; label: string; Icon: React.ComponentType<React.SVGProps<SVGSVGElement>> };
  collapsed: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  const { href, label, Icon } = item;
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      // Every one of these is always on screen on every page (BRIEF.md
      // layout), so Next's default viewport prefetch was silently
      // re-rendering and re-fetching every other tab's server data in
      // the background on every single page view - including live
      // Yahoo/Kite calls - well before the user ever clicked it
      // (DECISIONS.md). Off by default; a real click still navigates
      // immediately, it just isn't pre-warmed.
      prefetch={false}
      className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors ${
        collapsed ? "justify-center px-2.5" : ""
      } ${isActive ? "bg-gold-wash text-gold-light" : "text-muted hover:bg-panel-alt hover:text-text"}`}
      onClick={onNavigate}
    >
      <Icon />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

/**
 * "Mutual Funds" as an expandable tree (DECISIONS.md): one login can
 * track more than one family member's portfolio ("Self", plus whatever
 * else the user names - fully open, no preset set). Clicking the parent
 * row toggles expand/collapse rather than navigating; each profile
 * underneath is a real link to `/mutual-funds?profile=<id>`.
 */
function MutualFundsTreeNav({
  profiles: initialProfiles,
  collapsed,
}: {
  profiles: MutualFundProfileRow[];
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isOnMutualFunds = pathname === "/mutual-funds" || pathname.startsWith("/mutual-funds/");
  const activeProfileId = searchParams.get("profile");

  // Own copy, updated optimistically the moment a profile is created -
  // doesn't wait on (or race with) the server layout re-fetching its own
  // `profiles` prop, which App Router navigation isn't guaranteed to do
  // for a shared layout on a same-route, search-param-only navigation.
  const [profiles, setProfiles] = useState(initialProfiles);
  const [syncedInitialProfiles, setSyncedInitialProfiles] = useState(initialProfiles);

  // A router.refresh() anywhere else in the app (adding a trade, saving a
  // goal, editing strategy tags, ...) makes the server layout re-fetch a
  // fresh `initialProfiles` array. This component isn't remounted by that
  // (it's not a navigation), so without this the local state above would
  // never pick up the new array - keep it in sync, on top of the optimistic
  // local add on submit. Adjusted during render (React's documented pattern
  // for this), not in an effect.
  if (initialProfiles !== syncedInitialProfiles) {
    setSyncedInitialProfiles(initialProfiles);
    setProfiles(initialProfiles);
  }

  const [userToggledExpanded, setUserToggledExpanded] = useState<boolean | null>(null);
  const expanded = userToggledExpanded ?? isOnMutualFunds;

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAddProfile(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/mutual-fund-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        const { profile } = await res.json();
        setNewName("");
        setAdding(false);
        setProfiles((prev) => [...prev, profile]);
        router.push(`/mutual-funds?profile=${profile.id}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (collapsed) {
    return (
      <Link
        href="/mutual-funds"
        prefetch={false}
        className={`flex min-h-[44px] items-center justify-center rounded-lg px-2.5 font-medium transition-colors ${
          isOnMutualFunds ? "bg-gold-wash text-gold-light" : "text-muted hover:bg-panel-alt hover:text-text"
        }`}
      >
        <MutualFundIcon />
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setUserToggledExpanded(!expanded)}
        className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors ${
          isOnMutualFunds && !activeProfileId ? "bg-gold-wash text-gold-light" : "text-muted hover:bg-panel-alt hover:text-text"
        }`}
      >
        <MutualFundIcon />
        <span className="flex-1 text-left">Mutual Funds</span>
        <ChevronRightIcon className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-border pl-3">
          {profiles.map((profile) => {
            const isActive = isOnMutualFunds && activeProfileId === profile.id;
            return (
              <Link
                key={profile.id}
                href={`/mutual-funds?profile=${profile.id}`}
                prefetch={false}
                className={`flex min-h-[36px] items-center rounded-lg px-3 text-sm transition-colors ${
                  isActive ? "bg-gold-wash text-gold-light" : "text-muted hover:bg-panel-alt hover:text-text"
                }`}
              >
                {profile.name}
              </Link>
            );
          })}

          {adding ? (
            <form onSubmit={handleAddProfile} className="flex items-center gap-1.5 px-1 py-1">
              <input
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
                aria-label="New profile name"
                className="min-h-[32px] w-full min-w-0 rounded-md border border-border-strong bg-field px-2 text-sm text-text"
                onBlur={() => {
                  if (!newName.trim()) setAdding(false);
                }}
              />
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[32px] flex-shrink-0 rounded-md border border-gold bg-gold px-2 text-xs font-semibold text-bg hover:bg-gold-hover disabled:opacity-60"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-[32px] items-center rounded-lg px-3 text-left text-sm text-muted hover:bg-panel-alt hover:text-text"
            >
              + Add
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A plain, non-interactive section label sandwiched between two divider
 * lines (DECISIONS.md: a hand-sketched correction after an earlier
 * collapsible-category version was flagged as the wrong idea - "not what
 * i wanted... like hierarchy"). Its items sit underneath as ordinary flat
 * nav items, not nested inside this label - it's a heading, not a tree
 * node. Still renameable via a small pencil icon. Shared by all three
 * segments (Scanner/Trading/Investment) - each just points `apiPath` at
 * its own settings field.
 */
function SidebarSectionLabel({
  label: initialLabel,
  collapsed,
  apiPath,
}: {
  label: string;
  collapsed: boolean;
  apiPath: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(initialLabel);
  const [renaming, setRenaming] = useState(false);
  const [draftLabel, setDraftLabel] = useState(initialLabel);
  const [savingLabel, setSavingLabel] = useState(false);

  async function submitRename() {
    const trimmed = draftLabel.trim();
    if (!trimmed || trimmed === label) {
      setRenaming(false);
      return;
    }
    setSavingLabel(true);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      if (res.ok) {
        setLabel(trimmed);
        setRenaming(false);
        router.refresh();
      }
    } finally {
      setSavingLabel(false);
    }
  }

  if (collapsed) {
    return <div className="my-1 border-t border-border" />;
  }

  return (
    <div className="my-1.5">
      <div className="border-t border-border" />
      {renaming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitRename();
          }}
          className="px-3 py-1.5"
        >
          <input
            type="text"
            autoFocus
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onBlur={() => submitRename()}
            aria-label="Section name"
            className="min-h-[28px] w-full min-w-0 rounded-md border border-border-strong bg-field px-2 text-xs text-text"
          />
        </form>
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-1.5">
          <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-muted" title={label}>
            {label}
          </span>
          <button
            type="button"
            onClick={() => {
              setDraftLabel(label);
              setRenaming(true);
            }}
            aria-label="Rename section"
            className="flex-shrink-0 rounded p-0.5 text-muted hover:bg-panel-alt hover:text-text"
            disabled={savingLabel}
          >
            <PencilIcon width={11} height={11} />
          </button>
        </div>
      )}
      <div className="border-t border-border" />
    </div>
  );
}

export function Sidebar({
  siteName,
  email,
  mutualFundProfiles,
  longTermHoldingLabel,
  scannerLabel,
  tradingLabel,
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { india, us } = useMarketRegimes();
  const regime = { india: india.stage, us: us.stage };

  useEffect(() => {
    // One-time sync from localStorage (a client-only external system) on
    // mount - can't be a lazy useState initializer without a server/client
    // hydration mismatch, since this value doesn't exist during SSR.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
                {regimeLabel(regime.india)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>US</span>
              <span className="flex items-center gap-2 text-text">
                <span className={`inline-block h-[9px] w-[9px] rounded-full ${regimeDotClass(regime.us)}`} />
                {regimeLabel(regime.us)}
              </span>
            </div>
          </>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        <NavLink item={DASHBOARD_ITEM} collapsed={collapsed} pathname={pathname} onNavigate={() => setMobileOpen(false)} />

        <SidebarSectionLabel label={scannerLabel} collapsed={collapsed} apiPath="/api/settings/nav-scanner-label" />
        {SCANNER_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        ))}

        <SidebarSectionLabel label={tradingLabel} collapsed={collapsed} apiPath="/api/settings/nav-trading-label" />
        {TRADING_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        ))}

        <SidebarSectionLabel label={longTermHoldingLabel} collapsed={collapsed} apiPath="/api/settings/nav-long-term-label" />

        {/* A summary of everything underneath this label, so it sits above Mutual Funds/NPS rather than alongside them (DECISIONS.md). */}
        <NavLink
          item={{ href: "/net-worth", label: "Net Worth", Icon: NetWorthIcon }}
          collapsed={collapsed}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />

        <MutualFundsTreeNav profiles={mutualFundProfiles} collapsed={collapsed} />

        <NavLink
          item={{ href: "/nps", label: "NPS", Icon: NpsIcon }}
          collapsed={collapsed}
          pathname={pathname}
          onNavigate={() => setMobileOpen(false)}
        />

        <NavLink item={SETTINGS_ITEM} collapsed={collapsed} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
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
        className={`hidden md:sticky md:top-0 md:flex md:h-screen md:flex-col md:gap-5 self-start overflow-y-auto border-r border-border bg-sidebar p-4 transition-[flex-basis] ${
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
    // One-time sync from the <html data-theme> the root layout already set
    // server-side - can't be a lazy initializer without a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
