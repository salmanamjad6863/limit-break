import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ChatView } from '@/features/social/ChatView';
import { useConversations, useMarkConversationRead, useMessages, useSendMessage } from '@/features/social/api';
import { ScreenHeader } from '@/ui';

/** A DM thread: newest at the bottom, composer pinned above the keyboard, sends show instantly. */
export default function MessageThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const inbox = useConversations();
  const messages = useMessages(id);
  const send = useSendMessage(id);
  const mark = useMarkConversationRead();
  const peer = inbox.data?.conversations.find((x) => x.id === id)?.peer;

  useEffect(() => {
    if (id) mark.mutate(id);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ChatView
      header={<ScreenHeader title={peer ? `@${peer.handle}` : 'Messages'} />}
      rows={messages.data?.messages ?? []}
      onSend={(text) => peer && send.send(peer.userId, text)}
      canSend={!!peer}
      placeholder="Message…"
      maxLength={1000}
      empty={peer ? `Say hi to @${peer.handle}.` : 'Loading…'}
      error={send.isError ? `Couldn’t send: ${(send.error as Error).message}` : null}
    />
  );
}
