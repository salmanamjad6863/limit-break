import { activeSlots } from '@lb/contracts';
import { buildQuestFlow } from '@lb/engine';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FollowAlongPlayer, type FollowResult } from '@/features/follow';
import { useQuestActions, useQuests } from '@/features/quests';
import { useTheme } from '@/theme';

/** Follow-along for a quest (daily, penalty or side): runs the unfinished slots and writes progress back. */
export default function QuestFollowAlong() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { data } = useQuests();
  const { progress } = useQuestActions();
  const quest = data && [data.daily, data.penalty, ...data.sides].find((q) => q?.id === id);
  const slots = quest ? activeSlots(quest) : [];

  // only the slots still open; remember each one's real index in the quest
  const { steps, indexOf } = useMemo(() => {
    const open = slots.map((s, i) => ({ s, i, left: s.target - (quest?.progress[String(i)] ?? 0) })).filter((x) => x.left > 0);
    const built = buildQuestFlow(open.map(({ s, left }) => ({ ...s, target: left })));
    return { steps: built, indexOf: open.map((x) => x.i) };
  }, [quest]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  if (!quest || steps.length === 0) return <Redirect href="/quests" />;

  const save = (r: FollowResult) => {
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.slots)) {
      const real = indexOf[Number(k)]!;
      const slot = slots[real]!;
      const amount = slot.unit === 'min' ? Math.floor(v / 60) : v;
      if (amount > 0) patch[String(real)] = (quest.progress[String(real)] ?? 0) + amount;
    }
    if (Object.keys(patch).length) progress.mutate({ quest, progress: patch });
    router.replace('/quests');
  };

  const title = quest.kind === 'PENALTY' ? 'Penalty Zone' : quest.kind === 'DAILY' ? (quest.progress.option === 1 ? 'Rest Ritual' : 'Daily Quest') : 'Side Quest';
  return (
    <FollowAlongPlayer
      title={title}
      intro="Follow along at your own pace. Reps count when you tap; holds count by the clock."
      steps={steps}
      accent={c.danger}
      doneLabel="Claim progress"
      onDone={save}
      onExit={save}
    />
  );
}
