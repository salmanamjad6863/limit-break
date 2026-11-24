-- Own habit challenges (solo, always flexible: grace days, never restart) and daily check-ins.

CREATE TABLE "Challenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "graceDays" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "tasks" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Challenge_userId_status_idx" ON "Challenge"("userId", "status");
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChallengeCheckin" (
    "challengeId" UUID NOT NULL,
    "localDate" TEXT NOT NULL,
    "done" TEXT[],
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeCheckin_pkey" PRIMARY KEY ("challengeId","localDate")
);
ALTER TABLE "ChallengeCheckin" ADD CONSTRAINT "ChallengeCheckin_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Challenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChallengeCheckin" ENABLE ROW LEVEL SECURITY;
