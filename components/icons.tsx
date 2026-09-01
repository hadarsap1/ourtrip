// One drawn stroke-icon set for the whole app, replacing the system emoji that
// used to stand in for icons. Every glyph is a 24×24 viewBox at stroke-width
// 1.8, round caps and joins, `currentColor` — so an icon inherits the colour of
// whatever row, chip or tab holds it, and nothing renders differently between
// Android, iOS and desktop the way emoji do.
//
// Size comes from the className (`h-5 w-5`), never from width/height props.

import type { ComponentType, SVGProps } from "react";
import type { RecommendCategory } from "@/lib/recommendCategories";

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
    <path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 16H9l-5.5 4z" />
    <path d="M7.5 8h9M7.5 11.5h5.5" />
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

export const CheckIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2.2}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Glyph>
);

export const DownloadIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M12 3.5v11" />
    <path d="M8 11l4 4 4-4" />
    <path d="M4.5 16.5v2.2a1.3 1.3 0 0 0 1.3 1.3h12.4a1.3 1.3 0 0 0 1.3-1.3v-2.2" />
  </Glyph>
);

export const ExternalIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M13.5 5.5H5.8A1.3 1.3 0 0 0 4.5 6.8v11.4a1.3 1.3 0 0 0 1.3 1.3h11.4a1.3 1.3 0 0 0 1.3-1.3V10.5" />
    <path d="M20 4l-8.5 8.5M20 4h-4.8M20 4v4.8" />
  </Glyph>
);

export const UnlockIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 2.2} strokeLinejoin={undefined}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8.5 11V8a3.5 3.5 0 0 1 6.7-1.4" />
  </Glyph>
);

export const EditIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M16.5 4.2a1.9 1.9 0 0 1 2.7 2.7L9.6 16.5l-3.6 1 1-3.6z" />
    <path d="M14.8 6 18 9.2" />
  </Glyph>
);

export const TrashIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M4.5 6.5h15" />
    <path d="M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7" />
    <path d="M6.5 6.5l.9 12.4a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.4" />
    <path d="M10.3 10v7M13.7 10v7" />
  </Glyph>
);

export const DragHandleIcon = (p: IconProps) => (
  <Glyph {...p} strokeLinejoin={undefined}>
    <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
  </Glyph>
);

export const MoveIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M7.5 20.5 3 16m0 0 4.5-4.5M3 16h13.5" />
    <path d="M16.5 3.5 21 8m0 0-4.5 4.5M21 8H7.5" />
  </Glyph>
);

export const TicketIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5v1.9a1.8 1.8 0 0 0 0 3.2v1.9A1.5 1.5 0 0 1 18.5 17h-13A1.5 1.5 0 0 1 4 15.5v-1.9a1.8 1.8 0 0 0 0-3.2z" />
    <path d="M13 7.5v9" />
  </Glyph>
);

export const FileIcon = DocumentIcon;

export const TrainIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <rect x="6" y="3.5" width="12" height="12.5" rx="3" />
    <path d="M6.5 10h11" />
    <path d="M9.5 13h.01M14.5 13h.01" />
    <path d="M8.5 16 6.5 20M15.5 16l2 4" />
  </Glyph>
);

export const CarIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M4 16.5v-3.2l1.8-4.4A1.6 1.6 0 0 1 7.3 8h9.4a1.6 1.6 0 0 1 1.5 1l1.8 4.3v3.2" />
    <path d="M4 13.5h16" />
    <path d="M6.5 16.5v1.8M17.5 16.5v1.8" />
    <path d="M7.5 16h.01M16.5 16h.01" />
  </Glyph>
);

export const AttractionIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <circle cx="12" cy="10.5" r="6.5" />
    <path d="M12 4v13M5.5 10.5h13M7.4 5.9l9.2 9.2M16.6 5.9l-9.2 9.2" />
    <path d="M9 21h6l-3-4z" />
  </Glyph>
);

export const RainDropIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M12 3.5s5 5.7 5 9a5 5 0 0 1-10 0c0-3.3 5-9 5-9z" />
  </Glyph>
);

export const LinkIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <path d="M10 13.5a3.6 3.6 0 0 0 5.2.3l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.4 1.4" />
    <path d="M14 10.5a3.6 3.6 0 0 0-5.2-.3l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.4-1.4" />
  </Glyph>
);

export const CalendarIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.8}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
  </Glyph>
);

export const SuitcaseIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <rect x="3" y="7.5" width="18" height="12.5" rx="2.4" />
    <path d="M8.5 7.5V5.6A1.6 1.6 0 0 1 10.1 4h3.8a1.6 1.6 0 0 1 1.6 1.6v1.9" />
    <path d="M3 13h18" />
  </Glyph>
);

export const PrinterIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M7 9V4.8a.8.8 0 0 1 .8-.8h8.4a.8.8 0 0 1 .8.8V9" />
    <path d="M5.5 9h13a2 2 0 0 1 2 2v4.5a1 1 0 0 1-1 1H17V14H7v2.5H4.5a1 1 0 0 1-1-1V11a2 2 0 0 1 2-2z" />
    <rect x="7" y="14" width="10" height="6" rx="1" />
  </Glyph>
);

export const UsersIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <circle cx="9.5" cy="8.5" r="3" />
    <path d="M3.5 19.5c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M16 6.2a3 3 0 0 1 0 5.6" />
    <path d="M17.5 14.2a6 6 0 0 1 3 5.3" />
  </Glyph>
);

export const BagIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M5.4 8h13.2l-1 11.2a1.6 1.6 0 0 1-1.6 1.4H8a1.6 1.6 0 0 1-1.6-1.4z" />
    <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
  </Glyph>
);

export const StarIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.3-4.8-2.5-4.8 2.5.9-5.3L4.2 9.9l5.4-.8z" />
  </Glyph>
);

export const ClipboardIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <rect x="8" y="3.5" width="8" height="3.5" rx="1.2" />
    <path d="M8 5.2H6.4a1.4 1.4 0 0 0-1.4 1.4v12.5a1.4 1.4 0 0 0 1.4 1.4h11.2a1.4 1.4 0 0 0 1.4-1.4V6.6a1.4 1.4 0 0 0-1.4-1.4H16" />
  </Glyph>
);

export const BusIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <rect x="4" y="4" width="16" height="13" rx="2.4" />
    <path d="M4 11h16" />
    <path d="M7.5 14h.01M16.5 14h.01" />
    <path d="M7 17v2.2M17 17v2.2" />
  </Glyph>
);

export const CityIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M3 20.5V10l5.5-3v13.5" />
    <path d="M8.5 20.5V6l6-2.5v17" />
    <path d="M14.5 20.5v-9L21 14v6.5" />
    <path d="M2.5 20.5h19" />
  </Glyph>
);

export const LeafIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M20 4c0 8.5-4.5 13-11 13a5.5 5.5 0 0 1 0-11c4 0 6.5-1 11-2z" />
    <path d="M13 11c-3 1.6-5 4.4-6 9" />
  </Glyph>
);

export const RestaurantIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M6.5 3.5v7a2 2 0 0 0 4 0v-7" />
    <path d="M8.5 10.5v10" />
    <path d="M17 3.5c-1.6 0-2.5 2-2.5 4.5s.9 3.5 2.5 3.5 2.5-1 2.5-3.5S18.6 3.5 17 3.5z" />
    <path d="M17 11.5v9" />
  </Glyph>
);

export const BackpackIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <path d="M5.5 20.5V10a4.5 4.5 0 0 1 4.5-4.5h4A4.5 4.5 0 0 1 18.5 10v10.5z" />
    <path d="M9.5 5.5V4.6A1.6 1.6 0 0 1 11.1 3h1.8a1.6 1.6 0 0 1 1.6 1.6v.9" />
    <path d="M9 13h6" />
  </Glyph>
);

export const GlobeIcon = (p: IconProps) => (
  <Glyph {...p} strokeWidth={p.strokeWidth ?? 1.7}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17" />
    <path d="M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5S14.2 18.2 12 20.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5z" />
  </Glyph>
);

export const ShareIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M12 15V4" />
    <path d="M8 7.5 12 3.5l4 4" />
    <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
  </Glyph>
);

/* ---- weather -------------------------------------------------------------
   WMO code groups, drawn rather than emoji so the warm palette holds and the
   glyph doesn't change shape between Android and iOS. `describeWeather` still
   owns the Hebrew label; this owns the picture. */

export const CloudIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M7 18.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.3 11a3.8 3.8 0 0 1-.3 7.5z" />
  </Glyph>
);

export const PartlyCloudyIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M8.5 7.2A3.6 3.6 0 1 1 13 11.6" />
    <path d="M6.5 4.2v1.4M3.2 7.5h1.4M4.6 4.6l1 1" />
    <path d="M8 19.5a3.5 3.5 0 0 1-.3-7 4.8 4.8 0 0 1 9.2 1.2 3.3 3.3 0 0 1-.4 5.8z" />
  </Glyph>
);

export const RainIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M7 15.5a3.8 3.8 0 0 1-.4-7.6 5.2 5.2 0 0 1 10.1.4 3.6 3.6 0 0 1-.2 7.2z" />
    <path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" />
  </Glyph>
);

export const SnowIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M7 15.5a3.8 3.8 0 0 1-.4-7.6 5.2 5.2 0 0 1 10.1.4 3.6 3.6 0 0 1-.2 7.2z" />
    <path d="M9 19h.01M12.5 20.5h.01M16 19h.01" />
  </Glyph>
);

export const StormIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M7 15.5a3.8 3.8 0 0 1-.4-7.6 5.2 5.2 0 0 1 10.1.4 3.6 3.6 0 0 1-.2 7.2z" />
    <path d="M13 17l-3 3.2h3l-1 2.3" />
  </Glyph>
);

export const FogIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M7 13.5a3.8 3.8 0 0 1-.4-7.6 5.2 5.2 0 0 1 10.1.4 3.6 3.6 0 0 1-.2 7.2z" />
    <path d="M5 17h14M7 20h10" />
  </Glyph>
);

/** WMO code → drawn glyph, mirroring describeWeather's grouping. */
export function WeatherIcon({ code, ...p }: IconProps & { code: number }) {
  if (code === 0) return <SunIcon {...p} />;
  if (code <= 2) return <PartlyCloudyIcon {...p} />;
  if (code === 3) return <CloudIcon {...p} />;
  if (code <= 48) return <FogIcon {...p} />;
  if (code <= 67) return <RainIcon {...p} />;
  if (code <= 77) return <SnowIcon {...p} />;
  if (code <= 82) return <RainIcon {...p} />;
  if (code <= 86) return <SnowIcon {...p} />;
  return <StormIcon {...p} />;
}

/* ---- recommendation categories -------------------------------------------
   Typed as a full Record, so adding a category to RECOMMEND_CATEGORIES without
   giving it a glyph is a compile error — the invariant the old runtime test
   approximated, now enforced before the code runs. */

const RECOMMEND_CATEGORY_ICON: Record<
  RecommendCategory,
  ComponentType<IconProps>
> = {
  מסעדה: RestaurantIcon,
  אטרקציה: AttractionIcon,
  פארק: LeafIcon,
  מוזיאון: CityIcon,
  חנות: BagIcon,
  טיפ: SparkleIcon,
};

/** Glyph for a recommendation category; unknown or null falls back to a pin. */
export function RecommendCategoryIcon({
  category,
  ...p
}: IconProps & { category: string | null }) {
  const Icon =
    (category && RECOMMEND_CATEGORY_ICON[category as RecommendCategory]) ||
    PinIcon;
  return <Icon {...p} />;
}

export const CameraIcon = PhotosIcon;
