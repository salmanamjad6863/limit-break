/** Seeds static content (exercises + progression links) from @lb/content. Safe to re-run. */
import 'dotenv/config';
import { exercises } from '@lb/content';
import { createPrisma } from '../src';

const prisma = createPrisma();

async function main() {
  for (const e of exercises) {
    const data = {
      name: e.name, pattern: e.pattern, equipment: e.equipment, primary: e.primary,
      secondary: e.secondary, difficulty: e.difficulty, bwFactor: e.bwFactor, restType: e.restType,
    };
    await prisma.exercise.upsert({ where: { id: e.id }, create: { id: e.id, ...data }, update: data });
  }
  for (const e of exercises) {
    const chain = e.progression?.split('>') ?? [];
    for (let i = 1; i < chain.length; i++) {
      const [from, to] = [chain[i - 1]!, chain[i]!];
      await prisma.exerciseLink.upsert({
        where: { fromId_toId_kind: { fromId: from, toId: to, kind: 'PROGRESSION' } },
        create: { fromId: from, toId: to, kind: 'PROGRESSION' },
        update: {},
      });
    }
  }
  console.log(`Seeded ${exercises.length} exercises`);
}

main().finally(() => prisma.$disconnect());
