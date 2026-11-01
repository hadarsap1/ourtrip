// Who tells a podcast episode (00079). Names as shown, kids first.

type NamedMember = { display_name: string; role: string; is_preview?: boolean | null };

/** The names offered as chips: the kids, then the parents. No test members. */
export function narratorChoices(members: NamedMember[]): { kids: string[]; parents: string[] } {
  const real = members.filter((m) => !m.is_preview);
  const names = (role: string) => [...new Set(real.filter((m) => m.role === role).map((m) => m.display_name.trim()))].filter(Boolean);
  return { kids: names("kid"), parents: names("owner") };
}

/** "עומר", "עומר ואלה", "עומר, אלה וסיון". */
export function formatNarrators(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} ו${clean[clean.length - 1]}`;
}

/** Add a typed name once; ignores blanks and repeats. */
export function addNarrator(list: string[], name: string, max = 8): string[] {
  const n = name.trim().slice(0, 30);
  if (!n || list.includes(n) || list.length >= max) return list;
  return [...list, n];
}
