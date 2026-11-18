import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useConversations, useMarkConversationRead, useMessages, useSendMessage } from '@/features/social/api';
import { useTheme } from '@/theme';
import { Button, Page, ScreenHeader, Text } from '@/ui';

export default function MessageThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, spacing, radius, type } = useTheme();
  const inbox = useConversations();
  const messages = useMessages(id);
  const send = useSendMessage();
  const mark = useMarkConversationRead();
  const [body, setBody] = useState('');
  const peer = inbox.data?.conversations.find((x) => x.id === id)?.peer;
  const rows = [...(messages.data?.messages ?? [])].reverse();

  useEffect(() => {
    if (id) mark.mutate(id);
  }, [id]);

  return (
    <Page header={<ScreenHeader title={peer ? `@${peer.handle}` : 'Messages'} />}>
      <FlatList
        data={rows}
        keyExtractor={(m) => m.id}
        style={{ flexGrow: 0, maxHeight: 420 }}
        contentContainerStyle={{ gap: spacing[2], paddingVertical: spacing[2] }}
        renderItem={({ item: m }) => (
          <View style={{
            alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%',
            paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.md,
            backgroundColor: m.mine ? `${c.accent}33` : c.surfaceRaised,
            borderWidth: 1, borderColor: m.mine ? c.accent : c.border,
          }}>
            <Text variant="callout">{m.body}</Text>
            {m.status === 'pending' ? <Text variant="caption" color={c.warning}>Pending review</Text> : null}
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end' }}>
        <TextInput
          value={body} onChangeText={setBody} placeholder="Message…" placeholderTextColor={c.textMuted} multiline maxLength={1000}
          style={{ flex: 1, minHeight: 44, maxHeight: 120, color: c.text, fontFamily: type.body.font, fontSize: 16, padding: spacing[3], borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}
        />
        <Button size="md" label="Send" loading={send.isPending} disabled={!body.trim() || !peer}
          onPress={() => {
            if (!peer) return;
            const text = body.trim();
            setBody('');
            send.mutate({ peerId: peer.userId, body: text }, { onSuccess: () => void messages.refetch() });
          }} />
      </View>
      {send.isError ? <Text variant="caption" color={c.danger}>{(send.error as Error).message}</Text> : null}
    </Page>
  );
}
