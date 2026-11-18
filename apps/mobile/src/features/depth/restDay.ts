/** Rest-day lore + mobility prompts (SYSTEMS.md §6.9). Deterministic by game date. */
const LORE = [
  { title: 'The System observes', body: 'Rest is not failure. Muscle fibres reknit in silence. Tomorrow the ladder rises again.' },
  { title: 'Shadow stretches', body: 'Two minutes of hip openers now buy you cleaner depth next session. The System has noticed your patience.' },
  { title: 'Mana refill', body: 'Sleep is the rarest potion. Guard it. Your next Daily Quest scales with how you recover tonight.' },
  { title: 'Lore fragment', body: 'Hunters who never rest burn out before Rank C. Those who recover deliberately outlast the storm.' },
  { title: 'Mobility rite', body: 'Cat-cow, world’s greatest stretch, ankle rocks. Five minutes. No glory — only readiness.' },
  { title: 'Quiet power', body: 'The rank board sleeps too. Use today to log food, stretch, and leave the barbell alone.' },
  { title: 'System whisper', body: 'You are not idle. You are loading the next chapter. Walk, hydrate, then disappear into sleep.' },
];

export function restDayContent(localDate: string) {
  const n = [...localDate].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return LORE[n % LORE.length]!;
}
