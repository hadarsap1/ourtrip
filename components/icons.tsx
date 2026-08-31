// One drawn stroke-icon set for the whole app, replacing the system emoji that
// used to stand in for icons. Every glyph is a 24×24 viewBox at stroke-width
// 1.8, round caps and joins, `currentColor` — so an icon inherits the colour of
// whatever row, chip or tab holds it, and nothing renders differently between
// Android, iOS and desktop the way emoji do.
//
// Size comes from the className (`h-5 w-5`), never from width/height props.

import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  className?: string;
};

function Glyph({
  children,
  className = "h-5 w-5",
  strokeWidth = 1.8,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---- navigation ---------------------------------------------------------- */

export const HomeIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Glyph>
);

export const RouteIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6z" />
    <path d="M9 3v15M15 6v15" />
  </Glyph>
);

export const BudgetIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.4" />
    <path d="M3 10.5h18" />
    <path d="M16.5 14.8h2" />
  </Glyph>
);

export const DocumentIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M7.5 3h6l5 5v12.2a.8.8 0 0 1-.8.8H7.5a.8.8 0 0 1-.8-.8V3.8a.8.8 0 0 1 .8-.8z" />
    <path d="M13.5 3v5h5" />
  </Glyph>
);

export const MoreIcon = (p: IconProps) => (
  <Glyph {...p} strokeLinejoin={undefined}>
    <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </Glyph>
);

/* ---- memories ------------------------------------------------------------ */

export const JournalIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5A1.5 1.5 0 0 0 20 18.5z" />
  </Glyph>
);

export const PhotosIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 8h3l1.4-2h7.2L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3" />
  </Glyph>
);

export const MapIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6z" />
  </Glyph>
);

export const MessagesIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v6A2.5 2.5 0 0 1 17.5 15H9l-5 4z" />
  </Glyph>
);

export const MemoryBookIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-3.2L5 21z" />
    <path d="M9 8h6" />
  </Glyph>
);

/* ---- around you ---------------------------------------------------------- */

export const SparkleIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
    <path d="M18 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Glyph>
);

export const PhrasebookIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h5.5v9H8l-4 3.5z" />
    <path d="M12 8.5h5.5A2.5 2.5 0 0 1 20 11v5.5A2.5 2.5 0 0 1 17.5 19H16l-3 2.5V19h-1z" />
  </Glyph>
);

export const OptionsIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 4v16" />
  </Glyph>
);

/* ---- family & admin ------------------------------------------------------ */

export const ChecklistIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8.5 12.5l2.2 2.2L15.5 10" />
  </Glyph>
);

export const CoinIcon = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v8M9.5 10h5M9.5 14h5" />
  </Glyph>
);

export const PersonIcon = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
  </Glyph>
);

export const MailIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3.5 7.5l7.6 5.2a1.6 1.6 0 0 0 1.8 0l7.6-5.2" />
  </Glyph>
);

export const BellIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10z" />
    <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
  </Glyph>
);

/* ---- document types ------------------------------------------------------ */

export const PassportIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <circle cx="12" cy="10" r="2.6" />
    <path d="M8.5 16.5h7" />
  </Glyph>
);

export const ShieldCheckIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 3.5 19 6v6.5c0 4-3 7-7 8.5-4-1.5-7-4.5-7-8.5V6z" />
    <path d="M9.5 12l2 2 3.5-4" />
  </Glyph>
);

export const VaccineIcon = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8.5v7M8.5 12h7" />
  </Glyph>
);

export const VisaIcon = (p: IconProps) => (
  <Glyph {...p}>
    <circle cx="12" cy="11" r="6" />
    <path d="M6 20h12" />
  </Glyph>
);

/* ---- utility ------------------------------------------------------------- */

export const SearchIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Glyph>
);

export const PlusIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
);

export const CloseIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2.4}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Glyph>
);

// RTL: "forward"/into-a-detail points left, "back" points right.
export const ChevronForwardIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M14 6l-6 6 6 6" />
  </Glyph>
);

export const ChevronBackIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M10 6l6 6-6 6" />
  </Glyph>
);

export const PinIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.9}>
    <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </Glyph>
);

export const SunIcon = (p: IconProps) => (
  <Glyph {...p} strokeLinejoin={undefined}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </Glyph>
);

export const BedIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M3 19v-7h13a4 4 0 0 1 4 4v3M3 12V8" />
    <path d="M7 12V9.6A1.6 1.6 0 0 1 8.6 8h2A1.6 1.6 0 0 1 12.2 9.6V12" />
  </Glyph>
);

export const PlaneIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M4 14l16-5-3 8-4-2-3 4-1-4z" />
  </Glyph>
);

export const LockIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2.2} strokeLinejoin={undefined}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
  </Glyph>
);

export const WarningIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M12 4.5 20.5 19.5H3.5z" />
    <path d="M12 10v4M12 17h.01" />
  </Glyph>
);

export const ShareIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 15V4" />
    <path d="M8 7.5 12 3.5l4 4" />
    <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
  </Glyph>
);

export const CameraIcon = PhotosIcon;
