/**
 * Monthly global leaderboards (SYSTEMS.md §5.1), computed live from the ledgers.
 * Effort and consistency, never body weight or calories.
 *
 * Eligible: a saved (non-guest) account at least 14 days old, 18+, with a public handle.
 * Results are "final" from day 3 of the next month (the top 10 are reviewed by hand before that).
 */
import type { BoardId, BoardResponse, Division } from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { Prisma } from '@lb/db';
import { hunterCards, TIERS } from './service';

const ALL_RANKS = ['E', 'D', 'C', 'B', 'A', 'S', 'SOVEREIGN'];
const LIMIT = 100;

const monthBounds = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), endDate: end };
};

export const currentMonth = (now = new Date()) => now.toISOString().slice(0, 7);

/** Live standings of the month are provisional; the previous month is final from day 3. */
export const isFinal = (month: string, now = new Date()) => {
  const { endDate } = monthBounds(month);
  return now.getTime() >= endDate.getTime() + 2 * 86_400_000;
};

type Row = { userId: string; score: number };

/** Users who may appear on boards (eligibility in SQL, shared by every board). */
const eligible = (ranks: string[]) => Prisma.sql`
  SELECT p."id" AS "userId"
  FROM "Profile" p
  JOIN "PublicProfile" pp ON pp."userId" = p."id" AND pp."isPublic" = true
  JOIN auth.users u ON u."id" = p."id" AND COALESCE(u."is_anonymous", false) = false
  LEFT JOIN "HunterState" hs ON hs."userId" = p."id"
  WHERE p."createdAt" <= now() - interval '14 days'
    AND p."birthDate" IS NOT NULL AND p."birthDate" <= (current_date - interval '18 years')
    AND COALESCE(hs."rank"::text, 'E') = ANY(${ranks})`;

/** XP Champions: Σ granted XP this month (daily caps already applied). Returns the scored set, unordered. */
const xpScores = (start: string, end: string, ranks: string[]) => Prisma.sql`
  WITH elig AS (${eligible(ranks)})
  SELECT x."userId"::text AS "userId", SUM(x."amount")::float AS "score", MIN(x."createdAt") AS "tie"
  FROM "XpLedger" x JOIN elig e ON e."userId" = x."userId"
  WHERE x."localDate" >= ${start} AND x."localDate" < ${end}
  GROUP BY x."userId"
  HAVING SUM(x."amount") > 0`;

/**
 * Most Consistent: 100 × (0.6 × sessions done / sessions planned + 0.4 × quest days / days so far),
 * planned = the hunter's training weekdays that have passed this month. Needs ≥ 2 planned sessions
 * (≥ 8 for the final standings). Tie-break: longest streak.
 */
const consistentScores = (start: string, end: string, ranks: string[], minPlanned: number) => Prisma.sql`
  WITH elig AS (${eligible(ranks)}),
  days AS (
    SELECT d::date AS d FROM generate_series(${start}::date, LEAST(${end}::date - 1, current_date), interval '1 day') d
  ),
  ndays AS (SELECT GREATEST(COUNT(*), 1)::float AS n FROM days),
  planned AS (
    SELECT e."userId", COUNT(*)::float AS n
    FROM elig e JOIN "Profile" p ON p."id" = e."userId"
    JOIN days ON EXTRACT(DOW FROM days.d)::int = ANY(p."trainingWeekdays")
    GROUP BY e."userId"
  ),
  done AS (
    SELECT s."userId", COUNT(DISTINCT s."localDate")::float AS n FROM "WorkoutSession" s
    WHERE s."localDate" >= ${start} AND s."localDate" < ${end} AND s."kind" IN ('program', 'quick') AND s."source" = 'app'
    GROUP BY s."userId"
  ),
  quests AS (
    SELECT q."userId", COUNT(*)::float AS n FROM "QuestInstance" q
    WHERE q."kind" = 'DAILY' AND q."status" = 'COMPLETED' AND q."localDate" >= ${start} AND q."localDate" < ${end}
    GROUP BY q."userId"
  )
  SELECT pl."userId"::text AS "userId",
    ROUND((100 * (0.6 * LEAST(1, COALESCE(dn.n, 0) / pl.n) + 0.4 * LEAST(1, COALESCE(qu.n, 0) / (SELECT n FROM ndays))))::numeric, 1)::float AS "score",
    -COALESCE(hs."longest", 0) AS "tie"
  FROM planned pl
  LEFT JOIN done dn ON dn."userId" = pl."userId"
  LEFT JOIN quests qu ON qu."userId" = pl."userId"
  LEFT JOIN "HunterState" hs ON hs."userId" = pl."userId"
  WHERE pl.n >= ${minPlanned}`;

/** Top N, and one hunter's true place across the whole board (not just the top N). */
async function ranked(prisma: PrismaClient, scores: Prisma.Sql, me: string | null) {
  const top = await prisma.$queryRaw<Row[]>`
    SELECT "userId", "score" FROM (${scores}) s ORDER BY "score" DESC, "tie" ASC, "userId" ASC LIMIT ${LIMIT}`;
  const mine = me
    ? await prisma.$queryRaw<(Row & { place: number })[]>`
        SELECT * FROM (
          SELECT "userId", "score", (RANK() OVER (ORDER BY "score" DESC))::int AS "place" FROM (${scores}) s
        ) r WHERE r."userId" = ${me}`
    : [];
  return { top, mine: mine[0] as (Row & { place: number }) | undefined };
}

/* ---------------- cache ---------------- */

/**
 * Boards aggregate a whole month across every hunter, so they are computed once and shared:
 * the top list is cached per (board, division, month) for 3 minutes (forever once final), and each
 * viewer's own place is cached for the same window. Thousands of opens cost a handful of queries.
 */
const TTL_MS = 3 * 60_000;
type Standing = Awaited<ReturnType<typeof ranked>>;
const topCache = new Map<string, { at: number; top: Row[]; final: boolean }>();
const placeCache = new Map<string, { at: number; mine: Standing['mine'] }>();
const fresh = (e: { at: number; final?: boolean } | undefined) => !!e && (e.final || Date.now() - e.at < TTL_MS);
/** keep memory bounded: drop the oldest entries past this many keys */
const prune = (m: Map<string, unknown>, max: number) => { while (m.size > max) m.delete(m.keys().next().value as string); };

export function clearBoardCache() { topCache.clear(); placeCache.clear(); }

async function standings(prisma: PrismaClient, id: BoardId, division: Division, month: string, final: boolean, userId: string | null): Promise<Standing> {
  const { start, end } = monthBounds(month);
  const ranks = division === 'all' ? ALL_RANKS : TIERS[division as Exclude<Division, 'all'>];
  const scores = () => (id === 'xp' ? xpScores(start, end, ranks) : consistentScores(start, end, ranks, final ? 8 : 2));
  const key = `${id}:${division}:${month}`;
  const top = topCache.get(key);
  const place = userId ? placeCache.get(`${key}:${userId}`) : undefined;
  if (fresh(top) && (!userId || fresh(place))) return { top: top!.top, mine: place?.mine };
  const r = await ranked(prisma, scores(), userId);
  topCache.set(key, { at: Date.now(), top: r.top, final });
  if (userId) placeCache.set(`${key}:${userId}`, { at: Date.now(), mine: r.mine });
  prune(topCache, 200);
  prune(placeCache, 20_000);
  return r;
}

export async function board(
  prisma: PrismaClient,
  viewer: { userId: string; ineligible: string | null },
  id: BoardId,
  division: Division,
  month = currentMonth(),
): Promise<BoardResponse> {
  const final = isFinal(month);
  if (id === 'improved') {
    // needs stats re-tested ≥ 21 days apart; opens once the re-test history exists (Sprint 10)
    return { board: id, division, month, final, rows: [], me: null, meIneligible: 'Most Improved opens once hunters have re-tested (21 days after their first test).' };
  }
  const { top: rows, mine } = await standings(prisma, id, division, month, final, viewer.ineligible ? null : viewer.userId);
  const meRow: Row | undefined = mine ? { userId: mine.userId, score: mine.score } : undefined;
  // ties share a place on the list too
  const topPlace = (i: number) => rows.findIndex((r) => r.score === rows[i]!.score) + 1;
  const mePlace = mine?.place ?? 0;
  const cards = await hunterCards(prisma, [...rows.map((r) => r.userId), ...(meRow ? [meRow.userId] : [])]);
  const toRow = (r: Row, place: number) => {
    const hunter = cards.get(r.userId);
    return hunter ? { place, hunter, score: r.score } : null;
  };
  return {
    board: id, division, month, final,
    rows: rows.map((r, i) => toRow(r, topPlace(i))).filter((x): x is NonNullable<typeof x> => !!x),
    me: meRow ? toRow(meRow, mePlace) : null,
    meIneligible: viewer.ineligible,
  };
}
