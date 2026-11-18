import type { ModerationItem } from '@lb/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { unwrapCommunity } from '@/features/community/api';
import { useSession } from '@/features/session';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';
import { Appear, Button, Card, Page, ScreenHeader, Text } from '@/ui';

export default function ModerationQueue() {
  const { c, spacing } = useTheme();
  const on = useSession((s) => s.status === 'signedIn');
  const qc = useQueryClient();
  const queue = useQuery({
    queryKey: ['community', 'moderation'], enabled: on, refetchInterval: 30_000,
    queryFn: async () => unwrapCommunity<{ items: ModerationItem[] }>(await api.community.moderation.$get()),
  });
  const decide = useMutation({
    mutationFn: async (i: { type: 'post' | 'comment'; id: string; action: 'approve' | 'hide' }) =>
      unwrapCommunity(await api.community.moderation[':type'][':id'].$post({
        param: { type: i.type, id: i.id }, json: { action: i.action, reason: i.action === 'approve' ? 'looks fine' : 'policy' },
      })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['community', 'moderation'] }),
  });

  const items = queue.data?.items ?? [];

  return (
    <Page header={<ScreenHeader title="Moderation" />}>
      <Text variant="caption" dim>Moderator-only queue. High-severity items first. Photos on a post are approved or rejected with the post.</Text>
      {queue.isError ? <Card><Text color={c.danger}>{(queue.error as Error).message}</Text></Card> : null}
      {items.length === 0 && !queue.isLoading ? <Card><Text variant="callout" dim>Queue is clear.</Text></Card> : null}
      {items.map((item, i) => (
        <Appear key={`${item.targetType}:${item.targetId}`} index={i}>
          <Card>
            <Text variant="heading">{`${item.targetType} · @${item.author}`}</Text>
            <Text variant="caption" dim>{`${item.status} · ${item.openReports} open reports · ${item.reasons.join(', ') || 'held'}`}</Text>
            <Text variant="body">{item.body ?? '(no text)'}</Text>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <Button size="md" label="Approve" loading={decide.isPending}
                onPress={() => decide.mutate({ type: item.targetType, id: item.targetId, action: 'approve' })} />
              <Button size="md" variant="secondary" label="Hide" loading={decide.isPending}
                onPress={() => decide.mutate({ type: item.targetType, id: item.targetId, action: 'hide' })} />
            </View>
          </Card>
        </Appear>
      ))}
    </Page>
  );
}
