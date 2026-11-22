/**
 * Guild chat: loads via API, then listens on Supabase Realtime (GuildMessage INSERT)
 * when RLS allows the authenticated user to see their guild's rows.
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useGuildMessages, useMyGuild, usePostGuildMessage } from '@/features/social/api';
import { supabase } from '@/lib/supabase';
import { ChatView } from '@/features/social/ChatView';
import { ScreenHeader } from '@/ui';

export default function GuildChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mine = useMyGuild();
  const guild = mine.data?.guild;
  const query = useGuildMessages(id);
  const post = usePostGuildMessage(id);
  // the query cache is the list: realtime inserts refetch it, and sends appear in it instantly
  const live = query.data?.messages ?? [];

  useEffect(() => {
    if (!id || !supabase) return;
    const channel = supabase
      .channel(`guild:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'GuildMessage', filter: `guildId=eq.${id}` }, (payload) => {
        const row = payload.new as { id: string; authorId: string; body: string; status: string; createdAt: string };
        if (!row?.id) return;
        if (row.status !== 'visible') return; // pending ones show via API refetch for the author
        // realtime payload has no author card: refetch for complete rows (skip ones we already have)
        if (!(query.data?.messages ?? []).some((m) => m.id === row.id)) void query.refetch();
      })
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [id]);

  const title = guild?.id === id ? guild.name : 'Guild chat';

  return (
    <ChatView
      header={<ScreenHeader title={title} />}
      note="Pre-moderated. Trust level 1+ and age 18+ required."
      rows={live.map((m) => ({ id: m.id, body: m.body, mine: m.mine, status: m.status, createdAt: m.createdAt, author: m.author.handle }))}
      onSend={(text) => post.send(text)}
      placeholder="Message the guild…"
      maxLength={500}
      empty="No messages yet. Rally your guild."
      error={post.isError ? `Couldn’t send: ${(post.error as Error).message}` : null}
    />
  );
}
