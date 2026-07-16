import Link from "next/link";
import { strings } from "@/lib/strings";

export default function MorePage() {
  return (
    <div className="mx-auto max-w-lg px-4 pt-8">
      <h1 className="mb-6 text-2xl font-bold">{strings.nav.more}</h1>

      <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <li>
          <Link
            href="/checklists"
            className="flex items-center justify-between px-4 py-3.5 font-medium text-slate-800 hover:bg-slate-50"
          >
            {strings.more.menuChecklists}
            <span className="text-slate-300" aria-hidden="true">
              ‹
            </span>
          </Link>
        </li>
      </ul>

      <p className="mt-6 text-center text-sm text-slate-400">
        {strings.placeholders.more}
      </p>
    </div>
  );
}
