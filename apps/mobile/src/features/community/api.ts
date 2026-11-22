/**
 * Community data (SYSTEMS.md §5) for signed-in hunters. The server enforces every rule
 * (trust levels, moderation, blocks, visibility); the app mirrors permissions only to hide
 * buttons that would fail.
 */
import type {
  HunterCardDto,
  BoardId, BoardResponse, CommentDto, CommentsResponse, CommunityMeResponse, CreateCommentInput, CreatePostInput, Division, FeedResponse, FeedTab,
  PostDto, PublicProfileResponse, ReportInput, Sticker, UpdateCommunityProfileInput,
} from '@lb/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSession } from '@/features/session';
import { ApiError, api } from '@/lib/api';
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

type CommentsData = InfiniteData<CommentsResponse, string | undefined>;

/** Append a comment to the last loaded page (optimistic send). */
function appendComment(qc: ReturnType<typeof useQueryClient>, postId: string, c: CommentDto) {
  qc.setQueryData<CommentsData>(communityKeys.comments(postId), (d) => {
    if (!d?.pages.length) return { pages: [{ comments: [c], nextCursor: null }], pageParams: [undefined] };
    const pages = d.pages.map((pg, i) => (i === d.pages.length - 1 ? { ...pg, comments: [...pg.comments, c] } : pg));
    return { ...d, pages };
  });
}

/** Remove a comment from whichever page holds it (optimistic delete / undo). */
function removeComment(qc: ReturnType<typeof useQueryClient>, postId: string, id: string) {
  qc.setQueryData<CommentsData>(communityKeys.comments(postId), (d) =>
    d ? { ...d, pages: d.pages.map((pg) => ({ ...pg, comments: pg.comments.filter((x) => x.id !== id) })) } : d);
}

/** Swap the optimistic `sending:` row for the real server comment. */
function replaceComment(qc: ReturnType<typeof useQueryClient>, postId: string, fromId: string, next: CommentDto) {
  qc.setQueryData<CommentsData>(communityKeys.comments(postId), (d) =>
    d ? { ...d, pages: d.pages.map((pg) => ({ ...pg, comments: pg.comments.map((x) => (x.id === fromId ? next : x)) })) } : d);
}

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

/** Comments for a post: pages of top-level threads (with replies), flattened for the screen. */
export function useComments(postId: string) {
  const on = useSignedIn();
  const q = useInfiniteQuery({
    queryKey: communityKeys.comments(postId), enabled: on, staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrapCommunity<CommentsResponse>(await api.community.posts[':id'].comments.$get({
        param: { id: postId },
        query: pageParam ? { cursor: pageParam } : {},
      })),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const data = useMemo(() => q.data?.pages.flatMap((p) => p.comments) ?? undefined, [q.data]);
  return { ...q, data };
}

/**
 * Comment on a post. The comment shows on tap ("Sending…") with the author's own card; the id is
 * stamped once per send so a retry never doubles it, and a refused comment is removed with its error.
 */
export function useCreateComment(postId: string) {
  const qc = useQueryClient();
  const m = useMutation({
    retry: 2,
    mutationFn: async ({ input }: { input: CreateCommentInput & { id: string }; author: HunterCardDto }) =>
      unwrapCommunity<CommentDto>(await api.community.posts[':id'].comments.$post({ param: { id: postId }, json: input })),
    onMutate: ({ input, author }) => {
      const optimistic: CommentDto = {
        id: `sending:${input.id}`, postId, parentId: input.parentId ?? null, author, body: input.body,
        status: 'visible', mine: true, createdAt: new Date().toISOString(),
      };
      appendComment(qc, postId, optimistic);
      patchPost(qc, postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
      return () => {
        removeComment(qc, postId, optimistic.id);
        patchPost(qc, postId, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount - 1) }));
      };
    },
    onError: (_e, _v, undo) => undo?.(),
    onSuccess: (c, { input }) => {
      // swap the placeholder for the real row; held comments don't count publicly
      replaceComment(qc, postId, `sending:${input.id}`, c);
      if (c.status !== 'visible') patchPost(qc, postId, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount - 1) }));
    },
  });
  return {
    ...m,
    send: (body: string, parentId: string | null, author: HunterCardDto) => m.mutate({ input: { id: newId(), body, parentId }, author }),
  };
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: CommentDto) => unwrapCommunity(await api.community.comments[':id'].$delete({ param: { id: c.id } })),
    retry: 2,
    // gone on tap; put back if the server refuses
    onMutate: (c: CommentDto) => {
      const prev = qc.getQueryData<CommentsData>(communityKeys.comments(postId));
      removeComment(qc, postId, c.id);
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
