-- Sprint 4: Rank Trial attempts
CREATE TABLE "TrialAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "targetRank" "Rank" NOT NULL,
    "setting" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "composite" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrialAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrialAttempt_userId_createdAt_idx" ON "TrialAttempt"("userId", "createdAt");
ALTER TABLE "TrialAttempt" ADD CONSTRAINT "TrialAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."TrialAttempt" ENABLE ROW LEVEL SECURITY;
