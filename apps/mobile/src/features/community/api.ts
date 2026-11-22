/**
 * Community data (SYSTEMS.md §5) for signed-in hunters. The server enforces every rule
 * (trust levels, moderation, blocks, visibility); the app mirrors permissions only to hide
 * buttons that would fail.
 */
import type {
  BoardId, BoardResponse, CommentDto, CommunityMeResponse, CreateCommentInput, CreatePostInput, Division, FeedResponse, FeedTab,
  PostDto, PublicProfileResponse, ReportInput, Sticker, UpdateCommunityProfileInput,
} from '@lb/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useSession } from '@/features/session';
import { ApiError, api, unwrap } from '@/lib/api';
import { newId } from '@/lib/id';

export const communityKeys = {
  all: ['community'] as const,
  me: ['community', 'me'] as const,
  feed: (tab: FeedTab) => ['community', 'feed', tab] as const,
  comments: (postId: string) => ['community', 'comments', postId] as const,
  post: (postId: string) => ['community', 'post', postId] as const,
  hunter: (handle: string) => ['community', 'hunter', handle] as const,
  board: (board: BoardId, division: Division) => ['community', 'board', board, division] as const,
};

/** Server error text is written for people ("comments are turned off"); show it as-is. */
export async function unwrapCommunity<T>(res: Response | { ok: boolean; status: number; json(): Promise<unknown> }): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `API ${res.status}`);
  }
  return (await res.json()) as T;
}

const useSignedIn = () => useSession((s) => s.status === 'signedIn');

export function useCommunityMe() {
  const on = useSignedIn();
  return useQuery({
    queryKey: communityKeys.me, enabled: on, staleTime: 60_000,
    queryFn: async () => unwrapCommunity<CommunityMeResponse>(await api.community.me.$get()),
  });
}

export function useUpdateCommunityProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCommunityProfileInput) => unwrapCommunity<CommunityMeResponse>(await api.community.me.$put({ json: input })),
    onSuccess: (me) => {
      qc.setQueryData(communityKeys.me, me);
      void qc.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useFeed(tab: FeedTab) {
  const on = useSignedIn();
  return useInfiniteQuery({
    queryKey: communityKeys.feed(tab), enabled: on, staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrapCommunity<FeedResponse>(await api.community.feed.$get({ query: { tab, ...(pageParam ? { cursor: pageParam } : {}) } })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Patch one post in every cached feed and profile (optimistic reactions, comment counts). */
function patchPost(qc: ReturnType<typeof useQueryClient>, postId: string, fn: (p: PostDto) => PostDto) {
  qc.setQueryData<PostDto>(communityKeys.post(postId), (p) => (p ? fn(p) : p));
  qc.setQueriesData<InfiniteData<FeedResponse>>({ queryKey: ['community', 'feed'] }, (d) =>
    d ? { ...d, pages: d.pages.map((pg) => ({ ...pg, posts: pg.posts.map((p) => (p.id === postId ? fn(p) : p)) })) } : d,
  );
  qc.setQueriesData<PublicProfileResponse>({ queryKey: ['community', 'hunter'] }, (d) =>
    d ? { ...d, posts: d.posts.map((p) => (p.id === postId ? fn(p) : p)) } : d,
  );
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CreatePostInput, 'id'>) =>
      unwrapCommunity<PostDto>(await api.community.posts.$post({ json: { id: newId(), ...input } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['community', 'feed'] }),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapCommunity(await api.community.posts[':id'].$delete({ param: { id } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: communityKeys.all }),
  });
}

/** Find the freshest cached copy of a post (feeds, profiles or the post screen). */
export function cachedPost(qc: ReturnType<typeof useQueryClient>, postId: string): PostDto | undefined {
  const single = qc.getQueryData<PostDto>(communityKeys.post(postId));
  if (single) return single;
  for (const [, d] of qc.getQueriesData<InfiniteData<FeedResponse>>({ queryKey: ['community', 'feed'] })) {
    const p = d?.pages.flatMap((pg) => pg.posts).find((x) => x.id === postId);
    if (p) return p;
  }
  for (const [, d] of qc.getQueriesData<PublicProfileResponse>({ queryKey: ['community', 'hunter'] })) {
    const p = d?.posts.find((x) => x.id === postId);
    if (p) return p;
  }
  return undefined;
}

/** One post: instant from any cached feed, then fresh from the server (works from deep links too). */
export function usePost(postId: string) {
  const on = useSignedIn();
  const qc = useQueryClient();
  return useQuery({
    queryKey: communityKeys.post(postId), enabled: on && !!postId,
    initialData: () => cachedPost(qc, postId),
    initialDataUpdatedAt: 0, // always refetch once: counts may have moved
    queryFn: async () => unwrapCommunity<PostDto>(await api.community.posts[':id'].$get({ param: { id: postId } })),
  });
}

export function useReact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, sticker }: { postId: string; sticker: Sticker | null }) =>
      sticker
        ? unwrapCommunity(await api.community.posts[':id'].reaction.$put({ param: { id: postId }, json: { sticker } }))
        : unwrapCommunity(await api.community.posts[':id'].reaction.$delete({ param: { id: postId } })),
    onMutate: async ({ postId, sticker }) => {
      // stop in-flight refetches from overwriting the optimistic value, and diff against the cache, not a prop
      await qc.cancelQueries({ queryKey: communityKeys.all });
      const before = cachedPost(qc, postId);
      if (!before) return { before };
      const delta = (sticker ? 1 : 0) - (before.myReaction ? 1 : 0);
      patchPost(qc, postId, (p) => ({ ...p, myReaction: sticker, respectCount: Math.max(0, p.respectCount + delta) }));
      return { before };
    },
    // undo only this change: keep anything else that moved meanwhile (e.g. a new comment)
    onError: (_e, { postId }, ctx) => {
      if (ctx?.before) patchPost(qc, postId, (p) => ({ ...p, myReaction: ctx.before!.myReaction, respectCount: ctx.before!.respectCount }));
    },
    onSettled: (_r, _e, { postId }) => void qc.invalidateQueries({ queryKey: communityKeys.post(postId) }),
  });
}

export function useComments(postId: string) {
  const on = useSignedIn();
  return useQuery({
    queryKey: communityKeys.comments(postId), enabled: on,
    queryFn: async () => (await unwrapCommunity<{ comments: CommentDto[] }>(await api.community.posts[':id'].comments.$get({ param: { id: postId } }))).comments,
  });
}

export function useCreateComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CreateCommentInput, 'id'>) =>
      unwrapCommunity<CommentDto>(await api.community.posts[':id'].comments.$post({ param: { id: postId }, json: { id: newId(), ...input } })),
    onSuccess: (c) => {
      qc.setQueryData<CommentDto[]>(communityKeys.comments(postId), (list) => [...(list ?? []), c]);
      if (c.status === 'visible') patchPost(qc, postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
    },
  });
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: CommentDto) => unwrapCommunity(await api.community.comments[':id'].$delete({ param: { id: c.id } })),
    retry: 2,
    // gone on tap; put back if the server refuses
    onMutate: (c: CommentDto) => {
      const prev = qc.getQueryData<CommentDto[]>(communityKeys.comments(postId));
      qc.setQueryData<CommentDto[]>(communityKeys.comments(postId), (list) => (list ?? []).filter((x) => x.id !== c.id));
      if (c.status === 'visible') patchPost(qc, postId, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount - 1) }));
      return () => {
        qc.setQueryData(communityKeys.comments(postId), prev);
        if (c.status === 'visible') patchPost(qc, postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
      };
    },
    onError: (_e, _v, undo) => undo?.(),
  });
}

export function useHunter(handle: string) {
  const on = useSignedIn();
  return useQuery({
    queryKey: communityKeys.hunter(handle), enabled: on && !!handle,
    queryFn: async () => unwrapCommunity<PublicProfileResponse>(await api.community.hunters[':handle'].$get({ param: { handle } })),
  });
}

export function useFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, follow }: { userId: string; follow: boolean }) =>
      follow
        ? unwrapCommunity(await api.community.follows[':id'].$put({ param: { id: userId } }))
        : unwrapCommunity(await api.community.follows[':id'].$delete({ param: { id: userId } })),
    retry: 2,
    // the button and follower count flip on tap; a failure flips them back
    onMutate: async ({ userId, follow }) => {
      await qc.cancelQueries({ queryKey: ['community', 'hunter'] });
      const snaps = qc.getQueriesData<PublicProfileResponse>({ queryKey: ['community', 'hunter'] });
      for (const [key, p] of snaps) {
        if (p?.hunter.userId !== userId || p.iFollow === follow) continue;
        qc.setQueryData<PublicProfileResponse>(key, { ...p, iFollow: follow, followers: Math.max(0, p.followers + (follow ? 1 : -1)) });
      }
      return () => { for (const [key, p] of snaps) qc.setQueryData(key, p); };
    },
    onError: (_e, _v, undo) => undo?.(),
    onSettled: () => void qc.invalidateQueries({ queryKey: communityKeys.all }),
  });
}

export function useBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => unwrapCommunity(await api.community.blocks[':id'].$put({ param: { id: userId } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: communityKeys.all }),
  });
}

export function useReport() {
  return useMutation({
    mutationFn: async (input: ReportInput) => unwrapCommunity(await api.community.reports.$post({ json: input })),
  });
}

export function useBoard(board: BoardId, division: Division) {
  const on = useSignedIn();
  return useQuery({
    queryKey: communityKeys.board(board, division), enabled: on, staleTime: 15 * 60_000,
    queryFn: async () =>
      unwrapCommunity<BoardResponse>(await api.community.boards[':board'].$get({ param: { board }, query: { division } })),
  });
}
