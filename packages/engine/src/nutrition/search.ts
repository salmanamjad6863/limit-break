/** Unified food search ranking — SYSTEMS.md §2.7. */

export interface SearchableFood {
  id: string;
  name: string;
  brand?: string | null;
  verified: boolean;
  /** log-scaled global popularity, 0–1 */
  popularity?: number;
}

export interface PersonalUse {
  count: number;
  daysSinceLast: number;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();

function trigrams(s: string): Set<string> {
  const p = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  return out;
}

/** Simple English singular: "eggs" → egg, "tomatoes" → tomato, "berries" → berry. */
const singular = (w: string) =>
  w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y`
  : w.length > 4 && /(oes|ches|shes|xes|ses)$/.test(w) ? w.slice(0, -2)
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1)
  : w;
const singularize = (s: string) => s.split(' ').map(singular).join(' ');

/** Trigram similarity (0–1) with a prefix/word boost, so "chick" finds "Chicken breast" and "eggs" finds "Egg". */
export function textMatch(query: string, text: string): number {
  const q = singularize(norm(query));
  const t = singularize(norm(text));
  if (!q) return 0;
  if (t === q) return 1;
  const a = trigrams(q);
  const b = trigrams(t);
  let hit = 0;
  for (const g of a) if (b.has(g)) hit++;
  const sim = hit / (a.size + b.size - hit);
  const words = t.split(' ');
  const qWords = q.split(' ');
  const allPrefix = qWords.every((w) => words.some((x) => x.startsWith(w)));
  const startsWith = t.startsWith(q);
  return Math.min(1, sim + (allPrefix ? 0.35 : 0) + (startsWith ? 0.15 : 0));
}

export function foodScore(query: string, f: SearchableFood, use?: PersonalUse): number {
  const text = textMatch(query, f.brand ? `${f.name} ${f.brand}` : f.name);
  const personal = use ? Math.min(1, Math.log10(1 + use.count) / 2) : 0;
  const recency = use ? Math.exp(-use.daysSinceLast / 14) : 0;
  return 0.45 * text + 0.25 * personal + 0.15 * (f.verified ? 1 : 0) + 0.1 * (f.popularity ?? 0) + 0.05 * recency;
}

/** Ranked matches; foods with no meaningful text match are dropped. */
export function rankFoods<T extends SearchableFood>(query: string, foods: readonly T[], personal: ReadonlyMap<string, PersonalUse> = new Map(), limit = 30): T[] {
  return foods
    .map((f) => ({ f, text: textMatch(query, f.brand ? `${f.name} ${f.brand}` : f.name), score: foodScore(query, f, personal.get(f.id)) }))
    .filter((x) => x.text >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);
}
