-- Sprint 10: friends, guilds, raids, leagues, DMs, photo media (SYSTEMS.md §5.6).
-- API-only access; RLS enabled with no policies.

CREATE TABLE "PostMedia" (
  "id" UUID NOT NULL,
  "postId" UUID NOT NULL,
  "storageKey" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PostMedia_postId_idx" ON "PostMedia"("postId");
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FollowRequest" (
  "fromId" UUID NOT NULL,
  "toId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowRequest_pkey" PRIMARY KEY ("fromId","toId")
);
CREATE INDEX "FollowRequest_toId_createdAt_idx" ON "FollowRequest"("toId", "createdAt");
ALTER TABLE "FollowRequest" ADD CONSTRAINT "FollowRequest_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowRequest" ADD CONSTRAINT "FollowRequest_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FriendStreak" (
  "userA" UUID NOT NULL,
  "userB" UUID NOT NULL,
  "current" INTEGER NOT NULL DEFAULT 0,
  "longest" INTEGER NOT NULL DEFAULT 0,
  "lastBothDate" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FriendStreak_pkey" PRIMARY KEY ("userA","userB")
);
ALTER TABLE "FriendStreak" ADD CONSTRAINT "FriendStreak_userA_fkey" FOREIGN KEY ("userA") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendStreak" ADD CONSTRAINT "FriendStreak_userB_fkey" FOREIGN KEY ("userB") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FriendShieldGift" (
  "giverId" UUID NOT NULL,
  "receiverId" UUID NOT NULL,
  "month" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FriendShieldGift_pkey" PRIMARY KEY ("giverId","receiverId","month")
);
ALTER TABLE "FriendShieldGift" ADD CONSTRAINT "FriendShieldGift_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendShieldGift" ADD CONSTRAINT "FriendShieldGift_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Duel" (
  "id" UUID NOT NULL,
  "challengerId" UUID NOT NULL,
  "opponentId" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "challengerXp" INTEGER NOT NULL DEFAULT 0,
  "opponentXp" INTEGER NOT NULL DEFAULT 0,
  "challengerBaseline" INTEGER NOT NULL,
  "opponentBaseline" INTEGER NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Duel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Duel_challengerId_status_idx" ON "Duel"("challengerId", "status");
CREATE INDEX "Duel_opponentId_status_idx" ON "Duel"("opponentId", "status");
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Duel" ADD CONSTRAINT "Duel_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Guild" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "language" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "leaderId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Guild_code_key" ON "Guild"("code");
CREATE INDEX "Guild_isPublic_createdAt_idx" ON "Guild"("isPublic", "createdAt");
ALTER TABLE "Guild" ADD CONSTRAINT "Guild_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GuildMember" (
  "guildId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuildMember_pkey" PRIMARY KEY ("guildId","userId")
);
CREATE UNIQUE INDEX "GuildMember_userId_key" ON "GuildMember"("userId");
CREATE INDEX "GuildMember_guildId_idx" ON "GuildMember"("guildId");
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GuildMessage" (
  "id" UUID NOT NULL,
  "guildId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuildMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GuildMessage_guildId_createdAt_idx" ON "GuildMessage"("guildId", "createdAt");
ALTER TABLE "GuildMessage" ADD CONSTRAINT "GuildMessage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuildMessage" ADD CONSTRAINT "GuildMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Raid" (
  "id" UUID NOT NULL,
  "guildId" UUID NOT NULL,
  "weekStart" TEXT NOT NULL,
  "bossHp" INTEGER NOT NULL,
  "damageTotal" INTEGER NOT NULL DEFAULT 0,
  "clearedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Raid_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Raid_guildId_weekStart_key" ON "Raid"("guildId", "weekStart");
CREATE INDEX "Raid_weekStart_idx" ON "Raid"("weekStart");
ALTER TABLE "Raid" ADD CONSTRAINT "Raid_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RaidContribution" (
  "raidId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "expectedXp" INTEGER NOT NULL,
  CONSTRAINT "RaidContribution_pkey" PRIMARY KEY ("raidId","userId")
);
ALTER TABLE "RaidContribution" ADD CONSTRAINT "RaidContribution_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "Raid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaidContribution" ADD CONSTRAINT "RaidContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LeagueGroup" (
  "id" UUID NOT NULL,
  "weekStart" TEXT NOT NULL,
  "tier" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  CONSTRAINT "LeagueGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeagueGroup_weekStart_tier_index_key" ON "LeagueGroup"("weekStart", "tier", "index");
CREATE INDEX "LeagueGroup_weekStart_tier_idx" ON "LeagueGroup"("weekStart", "tier");

CREATE TABLE "LeagueMember" (
  "groupId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "place" INTEGER,
  CONSTRAINT "LeagueMember_pkey" PRIMARY KEY ("groupId","userId")
);
CREATE UNIQUE INDEX "LeagueMember_userId_groupId_key" ON "LeagueMember"("userId", "groupId");
CREATE INDEX "LeagueMember_userId_idx" ON "LeagueMember"("userId");
ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LeagueGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Conversation" (
  "id" UUID NOT NULL,
  "userA" UUID NOT NULL,
  "userB" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Conversation_userA_userB_key" ON "Conversation"("userA", "userB");
CREATE INDEX "Conversation_userB_idx" ON "Conversation"("userB");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userA_fkey" FOREIGN KEY ("userA") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userB_fkey" FOREIGN KEY ("userB") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Message" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostMedia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FriendStreak" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FriendShieldGift" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Duel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Guild" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuildMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GuildMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Raid" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RaidContribution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeagueGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeagueMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
