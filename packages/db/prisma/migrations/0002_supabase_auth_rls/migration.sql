-- Supabase-specific setup (ARCHITECTURE.md §2.2). Requires the Supabase `auth` schema.

-- 1) Create a Profile row whenever a user signs up (guest/anonymous included).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."Profile" (id, "updatedAt") VALUES (NEW.id, now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Deleting an auth user removes all their data (GDPR delete).
ALTER TABLE public."Profile"
  ADD CONSTRAINT "Profile_id_auth_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3) Lock every table from the public Data API. The Hono API connects as a privileged
--    role (bypasses RLS). Read-only Realtime policies are added per table when needed.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Exercise catalogue is public content.
CREATE POLICY "exercises are readable" ON public."Exercise" FOR SELECT USING (true);
CREATE POLICY "exercise links are readable" ON public."ExerciseLink" FOR SELECT USING (true);
