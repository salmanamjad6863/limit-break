-- Sprint 5: streak + quest scaling state, one quest instance per template per game day
ALTER TABLE "HunterState" ADD COLUMN "questScale" DOUBLE PRECISION NOT NULL DEFAULT 0.6;
ALTER TABLE "HunterState" ADD COLUMN "consecutiveFails" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HunterState" ADD COLUMN "shieldsMonth" TEXT;
ALTER TABLE "HunterState" ADD COLUMN "penaltyDate" TEXT;
ALTER TABLE "HunterState" ADD COLUMN "lastResolved" TEXT;
ALTER TABLE "HunterState" ADD COLUMN "sickDates" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE UNIQUE INDEX "QuestInstance_userId_localDate_templateId_key" ON "QuestInstance"("userId", "localDate", "templateId");
ALTER TABLE "WorkoutSession" ADD COLUMN "cardioMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0;
