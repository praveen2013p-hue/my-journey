/**
 * Nav + chrome icons, path data copied exactly from design/*.html (the
 * visual source of truth, BRIEF.md §14.3) so the sidebar matches pixel
 * for pixel.
 */

import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  );
}

export function BreakoutsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </Icon>
  );
}

export function PullbacksIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <polyline points="3 7 9 13 13 9 21 17" />
      <polyline points="15 17 21 17 21 11" />
    </Icon>
  );
}

export function PerformanceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 19h16" />
      <path d="M7 19V9M12 19V5M17 19v-7" />
    </Icon>
  );
}

export function SectorsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
    </Icon>
  );
}

export function MutualFundIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9z" />
      <path d="M4 10l2-5h12l2 5" />
      <path d="M9 14v2M12 14v2M15 14v2" />
    </Icon>
  );
}

export function NpsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 21V10l8-6 8 6v11" />
      <path d="M9 21v-7h6v7" />
    </Icon>
  );
}

export function NetWorthIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5c.6.9 1.9 1.5 3.5 1.5 2 0 3.5-1 3.5-2.3 0-1.4-1.3-1.9-3.5-2.4-2.2-.5-3.5-1-3.5-2.4C8.5 7.9 10 7 12 7c1.6 0 2.9.6 3.5 1.5" />
      <path d="M12 5.5v1.3M12 17.2v1.3" />
    </Icon>
  );
}

export function LongTermHoldingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="8" width="18" height="12" rx="1.5" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </Icon>
  );
}

export function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </Icon>
  );
}

export function JournalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h11" />
    </Icon>
  );
}

export function WeeklyReviewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </Icon>
  );
}

export function ThemeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width={16} height={16} {...props}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Icon>
  );
}

export function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width={14} height={14} {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </Icon>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width={16} height={16} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width={16} height={16} {...props}>
      <polyline points="15 5 8 12 15 19" />
    </Icon>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width={16} height={16} {...props}>
      <polyline points="9 5 16 12 9 19" />
    </Icon>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width={16} height={16} {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </Icon>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width={16} height={16} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon width={16} height={16} {...props}>
      <path d="M7 17L17 7M9 7h8v8" />
    </Icon>
  );
}

export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}
