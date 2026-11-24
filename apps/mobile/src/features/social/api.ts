/**
 * Friends / guilds / raids / leagues / DMs / Hunter License (SYSTEMS.md §5.6).
 */
import type {
  ConversationDto, CreateDuelInput, CreateGuildInput, CreateGuildMessageInput, DuelDto, FriendStreakDto,
  GuildDto, GuildMessageDto, HunterLicenseDto, JoinGuildInput, LeagueDto, MessageDto, RaidDto, SendMessageInput,
} from '@lb/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/session';
import { unwrapCommunity } from '@/features/community/api';
import { api } from '@/lib/api';
import { newId } from '@/lib/id';

export const socialKeys = {
  all: ['social'] as const,
  friends: ['social', 'friends'] as const,
  requests: ['social', 'follow-requests'] as const,
  duels: ['social', 'duels'] as const,
  guildMine: ['social', 'guild', 'mine'] as const,
  guild: (id: string) => ['social', 'guild', id] as const,
  raid: (id: string) => ['social', 'raid', id] as const,
  guildMessages: (id: string) => ['social', 'guild', id, 'messages'] as const,
  league: ['social', 'league'] as const,
  conversations: ['social', 'conversations'] as const,
  messages: (id: string) => ['social', 'messages', id] as const,
  license: ['social', 'license'] as const,
};

const useSignedIn = () => useSession((s) => s.status === 'signedIn');

export function useFriends() {
  const on = useSignedIn();
  return useQuery({
    queryKey: socialKeys.friends, enabled: on, staleTime: 30_000,
    queryFn: async () => unwrapCommunity<{ friends: FriendStreakDto[] }>(await api.social.friends.$get()),
  });
}

export function useGiftShield() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (friendId: string) => unwrapCommunity(await api.social.friends[':id'].shield.$post({ param: { id: friendId } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.friends }),
  });
}

export function useFollowRequests() {
  const on = useSignedIn();
  return useQuery({
    queryKey: socialKeys.requests, enabled: on, staleTime: 30_000,
    queryFn: async () => unwrapCommunity<{ requests: { from: FriendStreakDto['friend']; createdAt: string }[] }>(await api.social['follow-requests'].$get()),
  });
}

export function useRespondFollowRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { id: string; accept: boolean }) =>
      unwrapCommunity(await (i.accept
        ? api.social['follow-requests'][':id'].accept.$post({ param: { id: i.id } })
        : api.social['follow-requests'][':id'].decline.$post({ param: { id: i.id } }))),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: socialKeys.requests });
      void qc.invalidateQueries({ queryKey: socialKeys.friends });
    },
  });
}

export function useDuels() {
  const on = useSignedIn();
  return useQuery({
    queryKey: socialKeys.duels, enabled: on, staleTime: 30_000,
    queryFn: async () => unwrapCommunity<{ duels: DuelDto[] }>(await api.social.duels.$get()),
  });
}

export function useCreateDuel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opponentId: string) => {
      const json: CreateDuelInput = { id: newId(), opponentId };
      return unwrapCommunity<DuelDto>(await api.social.duels.$post({ json }));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.duels }),
  });
}

export function useRespondDuel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { id: string; accept: boolean }) =>
      unwrapCommunity(await (i.accept
        ? api.social.duels[':id'].accept.$post({ param: { id: i.id } })
        : api.social.duels[':id'].decline.$post({ param: { id: i.id } }))),
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.duels }),
  });
}

export function useMyGuild() {
  const on = useSignedIn();
  return useQuery({
    queryKey: socialKeys.guildMine, enabled: on, staleTime: 30_000,
    queryFn: async () => unwrapCommunity<{ guild: GuildDto | null }>(await api.social.guilds.mine.$get()),
  });
}

export function useCreateGuild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CreateGuildInput, 'id'> & { id?: string }) => {
      const json: CreateGuildInput = { id: input.id ?? newId(), name: input.name, isPublic: input.isPublic ?? true, language: input.language ?? null, timezone: input.timezone ?? 'UTC' };
      return unwrapCommunity<GuildDto>(await api.social.guilds.$post({ json }));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.guildMine }),
  });
}

export function useJoinGuild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const json: JoinGuildInput = { code };
      return unwrapCommunity<GuildDto>(await api.social.guilds.join.$post({ json }));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.guildMine }),
  });
}

export function useLeaveGuild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (guildId: string) => unwrapCommunity(await api.social.guilds[':id'].leave.$post({ param: { id: guildId } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.all }),
  });
}

export function useRaid(guildId: string | undefined) {
  const on = useSignedIn();
  return useQuery({
    queryKey: socialKeys.raid(guildId ?? ''), enabled: on && !!guildId, staleTime: 15_000,
    queryFn: async () => unwrapCommunity<RaidDto>(await api.social.guilds[':id'].raid.$get({ param: { id: guildId! } })),
  });
}

export function useGuildMessages(guildId: string | undefined) {
  const on = useSignedIn();
  return useQuery({
    queryKey: socialKeys.guildMessages(guildId ?? ''), enabled: on && !!guildId, staleTime: 10_000,
    queryFn: async () => unwrapCommunity<{ messages: GuildMessageDto[] }>(await api.social.guilds[':id'].messages.$get({ param: { id: guildId! }, query: {} })),
  });
}

/** Post to guild chat: shows on tap ("Sending…"), stamped id for safe retries, removed again on failure. */
export function usePostGuildMessage(guildId: string | undefined) {
  const qc = useQueryClient();
  const m = useMutation({
    retry: 2,
    mutationFn: async (json: CreateGuildMessageInput) =>
      unwrapCommunity<GuildMessageDto>(await api.social.guilds[':id'].messages.$post({ param: { id: guildId! }, json })),
    onMutate: async (json: CreateGuildMessageInput) => {
      if (!guildId) return undefined;
      const key = socialKeys.guildMessages(guildId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ messages: GuildMessageDto[] }>(key);
      const optimistic = {
        id: `sending:${json.id}`, body: json.body, status: 'visible', mine: true, createdAt: new Date().toISOString(),
        author: { userId: 'me', handle: 'you', heroId: null, heroClass: null, rank: 'E', level: 1, powerLevel: 0, title: null, frame: null, aura: null },
      } as GuildMessageDto;
      qc.setQueryData<{ messages: GuildMessageDto[] }>(key, { ...(prev ?? {}), messages: [optimistic, ...(prev?.messages ?? [])] });
      return () => qc.setQueryData(key, prev);
    },
    onError: (_e, _v, undo) => undo?.(),
    onSettled: () => guildId && void qc.invalidateQueries({ queryKey: socialKeys.guildMessages(guildId) }),
  });
  return { ...m, send: (body: string) => m.mutate({ id: newId(), body }) };
}

export function useLeague() {
  const on = useSignedIn();
  return useQuery({
    queryKey: socialKeys.league, enabled: on, staleTime: 30_000,
    queryFn: async () => unwrapCommunity<LeagueDto>(await api.social.league.$get()),
  });
}

export function useConversations() {
  const on = useSignedIn();
  return useQuery({
    queryKey: socialKeys.conversations, enabled: on, staleTime: 20_000,
    queryFn: async () => unwrapCommunity<{ conversations: ConversationDto[] }>(await api.social.conversations.$get()),
  });
}

export function useMessages(conversationId: string | undefined) {
  const on = useSignedIn();
  return useQuery({
    queryKey: socialKeys.messages(conversationId ?? ''), enabled: on && !!conversationId, staleTime: 10_000,
    queryFn: async () => unwrapCommunity<{ messages: MessageDto[] }>(await api.social.conversations[':id'].messages.$get({ param: { id: conversationId! }, query: {} })),
  });
}

/**
 * Send a DM. The message shows in the thread on tap ("Sending…"); the id is stamped once per send so a
 * retry never duplicates it, and a failure removes it again.
 */
export function useSendMessage(conversationId?: string) {
  const qc = useQueryClient();
  const m = useMutation({
    retry: 2,
    mutationFn: async (input: SendMessageInput) => unwrapCommunity<MessageDto>(await api.social.messages.$post({ json: input })),
    onMutate: async (input: SendMessageInput) => {
      if (!conversationId) return undefined;
      const key = socialKeys.messages(conversationId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ messages: MessageDto[] }>(key);
      const optimistic: MessageDto = { id: `sending:${input.id}`, senderId: 'me', body: input.body, status: 'visible', mine: true, createdAt: new Date().toISOString() };
      qc.setQueryData<{ messages: MessageDto[] }>(key, { messages: [optimistic, ...(prev?.messages ?? [])] });
      return () => qc.setQueryData(key, prev);
    },
    onError: (_e, _v, undo) => undo?.(),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: socialKeys.conversations });
      void qc.invalidateQueries({ queryKey: ['social', 'messages'] });
    },
  });
  return { ...m, send: (peerId: string, body: string) => m.mutate({ id: newId(), peerId, body }) };
}

export function useOpenConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (peerId: string) => unwrapCommunity<ConversationDto>(await api.social.conversations.$post({ json: { peerId } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.conversations }),
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapCommunity(await api.social.conversations[':id'].read.$post({ param: { id } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.conversations }),
  });
}

export function useHunterLicense() {
  const on = useSignedIn();
  return useQuery({
    queryKey: socialKeys.license, enabled: on, staleTime: 60_000,
    queryFn: async () => unwrapCommunity<HunterLicenseDto>(await api.social.license.$get()),
  });
}
