-- Sprint 10 polish: league settlement, DM read receipts, guild chat Realtime, community photo posts.

-- 1) League weeks are settled once (places written, promotion/demotion decided lazily by the API).
ALTER TABLE "LeagueGroup" ADD COLUMN "settledAt" TIMESTAMP(3);

-- 2) DM unread counts: when each side last opened the thread (A/B follow the pairKey ordering of userA/userB).
ALTER TABLE "Conversation" ADD COLUMN "readAtA" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "readAtB" TIMESTAMP(3);

-- 3) Guild chat over Supabase Realtime. The API stays the only writer; these policies let a signed-in
--    client LISTEN (postgres_changes) to messages of the guild it belongs to. Realtime evaluates RLS as the
--    subscriber, so "GuildMember" needs a self-row policy for the membership sub-select to see anything.
--    Blocks are not part of the policy: clients must drop messages from blocked hunters themselves.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON "GuildMember" TO authenticated;
    GRANT SELECT ON "GuildMessage" TO authenticated;
  END IF;
END $$;

DROP POLICY IF EXISTS guild_member_select_own ON "GuildMember";
CREATE POLICY guild_member_select_own ON "GuildMember" FOR SELECT TO authenticated
USING ("userId" = auth.uid());

DROP POLICY IF EXISTS guild_messages_select ON "GuildMessage";
CREATE POLICY guild_messages_select ON "GuildMessage" FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM "GuildMember" m WHERE m."guildId" = "GuildMessage"."guildId" AND m."userId" = auth.uid())
  AND ("status" = 'visible' OR "authorId" = auth.uid())
);

-- Add the table to the Realtime publication; ignore if it is already there or the publication doesn't exist
-- (e.g. a plain Postgres shadow database).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "GuildMessage";
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 4) Photo posts (SYSTEMS.md §5.2): "PostMedia" already exists (0012). Photos live in a PRIVATE Storage bucket
--    called `community-media` (objects at community/{userId}/{uuid}.jpg). Buckets can't be created safely from
--    a migration, so create it by hand in the Supabase dashboard (Storage -> New bucket, public OFF).
--    The API signs uploads and short-lived read URLs with the service role.
