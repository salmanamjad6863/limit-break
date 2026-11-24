-- Achievements (tiered badges, hidden ones) and the equipped title.

ALTER TABLE "Profile" ADD COLUMN "title" TEXT;

CREATE TABLE "AchievementUnlock" (
    "userId" UUID NOT NULL,
    "achievementId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementUnlock_pkey" PRIMARY KEY ("userId","achievementId","tier")
);
CREATE INDEX "AchievementUnlock_userId_unlockedAt_idx" ON "AchievementUnlock"("userId", "unlockedAt");
ALTER TABLE "AchievementUnlock" ADD CONSTRAINT "AchievementUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AchievementUnlock" ENABLE ROW LEVEL SECURITY;
