-- A/S Rank Trial verification for leaderboards (SYSTEMS.md §4.4)
ALTER TABLE "TrialAttempt"
  ADD COLUMN "verification" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "videoKey" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewerId" UUID,
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- passes at A or S already on record need verification before they appear on boards
UPDATE "TrialAttempt" SET "verification" = 'required' WHERE "passed" = true AND "targetRank" IN ('A', 'S') AND "verified" = false;
UPDATE "TrialAttempt" SET "verification" = 'verified' WHERE "verified" = true;

CREATE INDEX "TrialAttempt_verification_submittedAt_idx" ON "TrialAttempt"("verification", "submittedAt");

-- Private bucket for trial videos: no public read; the API hands out signed URLs only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('trial-videos', 'trial-videos', false, 52428800, ARRAY['video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

-- Explicit consent to health-data processing (GDPR Art. 9), recorded at onboarding
ALTER TABLE "Profile" ADD COLUMN "consentVersion" TEXT, ADD COLUMN "consentedAt" TIMESTAMP(3);
