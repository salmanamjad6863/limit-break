import { router } from 'expo-router';
import { View } from 'react-native';
import { Avatar } from '@/features/community/Avatar';
import { heroColor } from '@/features/community/PostCard';
import { useConversations } from '@/features/social/api';
import { useTheme } from '@/theme';
import { Appear, Card, Page, PressableScale, ScreenHeader, Text } from '@/ui';

export default function MessagesInbox() {
  const { c, spacing } = useTheme();
  const inbox = useConversations();
  const rows = inbox.data?.conversations ?? [];

  return (
    <Page header={<ScreenHeader title="Messages" />}>
      <Text variant="caption" dim>Mutual follows only, both 18+. Text only — no photos in DMs yet.</Text>
      {rows.length === 0 ? (
        <Card><Text variant="callout" dim>No conversations yet. Open a hunter’s profile and message them when you follow each other.</Text></Card>
      ) : rows.map((row, i) => (
        <Appear key={row.id} index={i}>
          <PressableScale haptic="tap" onPress={() => router.push(`/social/messages/${row.id}`)} accessibilityRole="button"
            style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'center', padding: spacing[3], borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
            <Avatar handle={row.peer.handle} color={heroColor(row.peer)} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="heading">@{row.peer.handle}</Text>
                {row.unread > 0 ? <Text variant="caption" color={c.accent}>{`${row.unread} new`}</Text> : null}
              </View>
              <Text variant="caption" dim numberOfLines={1}>{row.lastBody ?? 'Say hello'}</Text>
            </View>
          </PressableScale>
        </Appear>
      ))}
    </Page>
  );
}
