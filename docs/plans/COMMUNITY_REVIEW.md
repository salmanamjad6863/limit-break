# Community Review: Findings and Fixes

Goal: the community must feel smooth and keep working with thousands of active hunters.

## 1. What I tested in the app
| Area | Result |
|---|---|
| The Hall | ❌ A failed background refresh left "Couldn't load the feed. Pull to refresh…" under posts that loaded fine, and there was no pull-to-refresh. |
| Feed paging | ❌ Following / Rank page 2 always failed (cursor longer than the 40-char limit). Global uses "Load more" tapping. |
| Loading | Text "Loading the Hall…" instead of placeholders. |
| Guild | "Mod queue" button shown to every user (server blocks it, but it shouldn't be visible). |
| Top Hunters, Guild, Messages | Work. |

## 2. Server review (scale)
Full review of `apps/api/src/modules/community` and `social` with the schema. In priority order:

**High**
1. Following / Rank page 2 rejected (cursor 61 chars vs `max(40)`). **Fixed.**
2. Leaderboards re-aggregate the whole month twice per request, no cache, no index → **cached 3 min** (forever once final) + indexes. **Fixed.**
3. Inbox: 50 conversations in no order + 2 queries each (100 queries) → `lastMessageAt` column + index, one SQL for last message and unread. **Fixed.**
4. League: the first read after Monday settles every group in one request → settle only the caller's group. **Follow-up (job).**
5. Message / guild-message rate-limit counts scan the whole table → indexes. **Fixed.**
6. Rate limiter is per-process memory; feed/league/raid/inbox reads unlimited → read limits added. **Shared store (Redis/Upstash) is a deploy-time follow-up.**
7. LLM moderation blocks each post/comment/message for up to ~16 s → 3 s timeout, no retry, small token budget; failure behaviour unchanged (trusted → allowed, new → held). **Fixed. Async queue is a follow-up.**

**Medium / low** (fixed unless marked)
- Following feed bounded with an index on `(authorId, createdAt DESC, id DESC)`; Rank tab gets its own index.
- Upheld-report join casts the key (no index use) → rewritten; `Report (targetType, targetId, status)` and `(status, resolvedAt)` indexes.
- Moderation queue looked up actions without `targetType` → fixed.
- `react()` insert + counter not in one transaction → fixed.
- DM / guild chat history paging marked the thread read on every older page → only the newest page marks read.
- Indexes for friend streaks, shield gifts, duels, guild discovery, leaderboards.
- Follow-ups: global feed ranked-ID cache, comments pagination, batch photo-URL signing, guild `memberCount`, league membership uniqueness per week, friends list pagination.

## 3. App fixes
- Pull-to-refresh on Community (refreshes the pane you're on).
- Infinite feed: the next page loads by itself near the bottom; skeleton cards while loading; "You're all caught up" at the end.
- Errors only when there is nothing to show, with a Try again button; a failed "load more" shows a retry row.
- Post cards are memoised: a reaction re-renders one card, not the whole feed.
- "Mod queue" shows only for moderators.
