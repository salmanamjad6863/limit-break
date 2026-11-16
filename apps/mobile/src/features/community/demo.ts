/** Preview data for the Community tab until the social API ships (SYSTEMS.md §5). */
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export const DEMO_POSTS = [
  {
    id: 'p1', handle: 'kaze.runs', color: '#3DDC97', rank: 'C' as Rank, ago: '12m', kind: 'milestone' as const,
    title: 'Promoted to C-Rank', body: 'Passed the C-Rank Trial: 41 push-ups, 2:40 plank, 1.6 km in 7:52.',
    respect: 128, comments: 14,
  },
  {
    id: 'p2', handle: 'aiko_t', color: '#38C6F4', rank: 'D' as Rank, ago: '1h', kind: 'post' as const,
    title: null, body: 'Week 9 of Ranger Run done. First 5K without walking, under 30 minutes. Started at E-Rank barely jogging 2 minutes.',
    workout: { name: '5K Run', stats: ['5.0 km', '29:41', 'Zone 2–3'] }, respect: 342, comments: 37,
  },
  {
    id: 'p3', handle: 'gora.lifts', color: '#FF9F43', rank: 'B' as Rank, ago: '3h', kind: 'pr' as const,
    title: 'New personal record', body: 'Conventional deadlift', workout: { name: 'Deadlift', stats: ['170 kg × 3', 'e1RM 181 kg', '+6 kg'] },
    respect: 211, comments: 22,
  },
];

export const BOARDS = [
  { id: 'consistent', label: 'Most Consistent', unit: '' },
  { id: 'improved', label: 'Most Improved', unit: '%' },
  { id: 'xp', label: 'XP Champions', unit: ' XP' },
] as const;
export type BoardId = (typeof BOARDS)[number]['id'];

export const DEMO_LEADERS: Record<BoardId, { handle: string; color: string; rank: Rank; score: number }[]> = {
  consistent: [
    { handle: 'shinobi.mira', color: '#3DDC97', rank: 'D', score: 100 },
    { handle: 'ironwill', color: '#FF4D6D', rank: 'B', score: 100 },
    { handle: 'aiko_t', color: '#38C6F4', rank: 'D', score: 98.7 },
    { handle: 'kaze.runs', color: '#3DDC97', rank: 'C', score: 97.3 },
    { handle: 'monk.hoshi', color: '#F5C451', rank: 'C', score: 96.0 },
    { handle: 'ren_k', color: '#7C5CFF', rank: 'E', score: 95.2 },
  ],
  improved: [
    { handle: 'newblade', color: '#FF4D6D', rank: 'E', score: 48.2 },
    { handle: 'aiko_t', color: '#38C6F4', rank: 'D', score: 41.0 },
    { handle: 'tidecaller', color: '#7C5CFF', rank: 'E', score: 37.5 },
    { handle: 'gora.lifts', color: '#FF9F43', rank: 'B', score: 22.1 },
    { handle: 'kaze.runs', color: '#3DDC97', rank: 'C', score: 19.8 },
    { handle: 'shinobi.mira', color: '#3DDC97', rank: 'D', score: 18.4 },
  ],
  xp: [
    { handle: 'ironwill', color: '#FF4D6D', rank: 'B', score: 13920 },
    { handle: 'gora.lifts', color: '#FF9F43', rank: 'B', score: 13410 },
    { handle: 'kaze.runs', color: '#3DDC97', rank: 'C', score: 12880 },
    { handle: 'monk.hoshi', color: '#F5C451', rank: 'C', score: 12005 },
    { handle: 'aiko_t', color: '#38C6F4', rank: 'D', score: 11760 },
    { handle: 'shinobi.mira', color: '#3DDC97', rank: 'D', score: 11390 },
  ],
};

export const DEMO_ME_ON_BOARD: Record<BoardId, { place: number; score: number }> = {
  consistent: { place: 214, score: 82.4 },
  improved: { place: 96, score: 12.5 },
  xp: { place: 1870, score: 3176 },
};
