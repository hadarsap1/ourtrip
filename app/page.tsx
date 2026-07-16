import { strings } from "@/lib/strings";

export default function TodayPage() {
  const today = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="mx-auto max-w-lg px-4 pt-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">{strings.nav.today}</h1>
        <p className="text-sm text-slate-500">{today}</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">
          {strings.today.emptyTitle}
        </h2>
        <p className="text-sm text-slate-500">{strings.today.emptyBody}</p>
      </section>
    </div>
  );
}
