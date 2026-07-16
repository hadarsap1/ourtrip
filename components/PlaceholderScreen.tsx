import { strings } from "@/lib/strings";

export function PlaceholderScreen({
  title,
  note,
}: {
  title: string;
  note: string;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 pt-8">
      <h1 className="mb-8 text-2xl font-bold">{title}</h1>
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="mb-1 text-lg font-semibold text-slate-400">
          {strings.placeholders.comingSoon}
        </p>
        <p className="text-sm text-slate-500">{note}</p>
      </section>
    </div>
  );
}
