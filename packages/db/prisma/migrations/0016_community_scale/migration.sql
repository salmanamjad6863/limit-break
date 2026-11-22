-- Community / social at scale (docs/plans/COMMUNITY_REVIEW.md): indexes for the real query shapes,
-- and Conversation.lastMessageAt so the inbox is ordered without scanning messages.

ALTER TABLE "Conversation" ADD COLUMN "lastMessageAt" TIMESTAMP(3);
-- backfill from existing messages
UPDATE "Conversation" c SET "lastMessageAt" = m.last
FROM (SELECT "conversationId", MAX("createdAt") AS last FROM "Message" GROUP BY "conversationId") m
WHERE m."conversationId" = c."id";

-- inbox: my threads, newest first
CREATE INDEX "Conversation_userA_lastMessageAt_idx" ON "Conversation"("userA", "lastMessageAt");
DROP INDEX IF EXISTS "Conversation_userB_idx";
CREATE INDEX "Conversation_userB_lastMessageAt_idx" ON "Conversation"("userB", "lastMessageAt");

-- following feed + profiles: keyset (createdAt, id) per author
DROP INDEX IF EXISTS "Post_authorId_createdAt_idx";
CREATE INDEX "Post_authorId_createdAt_id_idx" ON "Post"("authorId", "createdAt", "id");
-- rank tab: public, visible posts of a rank tier, newest first
CREATE INDEX "Post_visibility_status_authorRank_createdAt_id_idx" ON "Post"("visibility", "status", "authorRank", "createdAt", "id");

-- reports: lookups by target, and the 30-day upheld window in trust checks
CREATE INDEX "Report_targetType_targetId_status_idx" ON "Report"("targetType", "targetId", "status");
CREATE INDEX "Report_status_resolvedAt_idx" ON "Report"("status", "resolvedAt");

-- per-sender rate-limit counts on the fastest-growing tables
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message"("senderId", "createdAt");
CREATE INDEX "GuildMessage_authorId_createdAt_idx" ON "GuildMessage"("authorId", "createdAt");

-- friends: streaks where I'm the second user, gifts I received this month
CREATE INDEX "FriendStreak_userB_idx" ON "FriendStreak"("userB");
CREATE INDEX "FriendShieldGift_receiverId_month_idx" ON "FriendShieldGift"("receiverId", "month");

-- guild discovery filtered by language
CREATE INDEX "Guild_isPublic_language_createdAt_idx" ON "Guild"("isPublic", "language", "createdAt");

-- monthly leaderboards aggregate by date across all hunters
CREATE INDEX "XpLedger_localDate_userId_idx" ON "XpLedger"("localDate", "userId");
CREATE INDEX "WorkoutSession_localDate_userId_idx" ON "WorkoutSession"("localDate", "userId");
CREATE INDEX "QuestInstance_kind_status_localDate_idx" ON "QuestInstance"("kind", "status", "localDate");

-- duels list ordered by createdAt
CREATE INDEX "Duel_challengerId_createdAt_idx" ON "Duel"("challengerId", "createdAt");
CREATE INDEX "Duel_opponentId_createdAt_idx" ON "Duel"("opponentId", "createdAt");
