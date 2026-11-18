/**
 * Guild chat: loads via API, then listens on Supabase Realtime (GuildMessage INSERT)
 * when RLS allows the authenticated user to see their guild's rows.
 */
import type { GuildMessageDto } from '@lb/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useGuildMessages, useMyGuild, usePostGuildMessage } from '@/features/social/api';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';
import { Button, Page, ScreenHeader, Text } from '@/ui';

export default function GuildChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, spacing, radius, type } = useTheme();
  const mine = useMyGuild();
  const guild = mine.data?.guild;
  const query = useGuildMessages(id);
  const post = usePostGuildMessage(id);
  const [body, setBody] = useState('');
  const [live, setLive] = useState<GuildMessageDto[]>([]);

  useEffect(() => {
    setLive(query.data?.messages ?? []);
  }, [query.data?.messages]);

  useEffect(() => {
    if (!id || !supabase) return;
    const channel = supabase
      .channel(`guild:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'GuildMessage', filter: `guildId=eq.${id}` }, (payload) => {
        const row = payload.new as { id: string; authorId: string; body: string; status: string; createdAt: string };
        if (!row?.id) return;
        if (row.status !== 'visible') return; // pending ones show via API refetch for the author
        setLive((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          // Realtime payload has no author card — refetch for a complete DTO
          void query.refetch();
          return prev;
        });
      })
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [id]);

  const rows = [...live].reverse();
  const title = guild?.id === id ? guild.name : 'Guild chat';

  return (
    <Page header={<ScreenHeader title={title} />}>
      <Text variant="caption" dim>Pre-moderated. Trust level 1+ and age 18+ required.</Text>
      <FlatList
        data={rows}
        keyExtractor={(m) => m.id}
        style={{ flexGrow: 0, maxHeight: 420 }}
        contentContainerStyle={{ gap: spacing[2], paddingVertical: spacing[2] }}
        renderItem={({ item: m }) => (
          <View style={{
            alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '85%',
            padding: spacing[3], borderRadius: radius.md, gap: 2,
            backgroundColor: m.mine ? `${c.accent}33` : c.surfaceRaised, borderWidth: 1, borderColor: c.border,
          }}>
            {!m.mine ? <Text variant="caption" color={c.accent}>@{m.author.handle}</Text> : null}
            <Text variant="callout">{m.body}</Text>
            {m.status === 'pending' ? <Text variant="caption" color={c.warning}>Pending review</Text> : null}
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'flex-end' }}>
        <TextInput
          value={body} onChangeText={setBody} placeholder="Message the guild…" placeholderTextColor={c.textMuted} multiline maxLength={500}
          style={{ flex: 1, minHeight: 44, maxHeight: 120, color: c.text, fontFamily: type.body.font, fontSize: 16, padding: spacing[3], borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}
        />
        <Button size="md" label="Send" loading={post.isPending} disabled={!body.trim()}
          onPress={() => {
            const text = body.trim();
            setBody('');
            post.mutate(text);
          }} />
      </View>
      {post.isError ? <Text variant="caption" color={c.danger}>{(post.error as Error).message}</Text> : null}
    </Page>
  );
}
