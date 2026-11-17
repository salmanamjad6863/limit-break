-- Sprint 5.5: schedule, history, edits, manual logs, notes, set types (SYSTEMS.md §3.10–3.11)
ALTER TABLE "Profile"
  ADD COLUMN "trainingWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "workoutTime" TEXT;

-- existing users: weekdays from the old fixed template for their days/week
UPDATE "Profile" SET "trainingWeekdays" = CASE "daysPerWeek"
  WHEN 2 THEN ARRAY[1,4] WHEN 3 THEN ARRAY[1,3,5] WHEN 4 THEN ARRAY[1,2,4,5]
  WHEN 5 THEN ARRAY[1,2,3,4,5] WHEN 6 THEN ARRAY[1,2,3,4,5,6] ELSE ARRAY[1,3,5] END
WHERE "daysPerWeek" IS NOT NULL;

ALTER TABLE "WorkoutSession"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'program',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'app',
  ADD COLUMN "name" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "programId" TEXT,
  ADD COLUMN "dayId" TEXT,
  ADD COLUMN "sessionRpe" DOUBLE PRECISION,
  ADD COLUMN "xpGranted" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "editedAt" TIMESTAMP(3);

-- credit already-granted workout XP to each session
UPDATE "WorkoutSession" s SET "xpGranted" = COALESCE((SELECT SUM(l."amount") FROM "XpLedger" l WHERE l."eventId" = s."id"), 0);
-- sessions with only cardio minutes were quick sessions
UPDATE "WorkoutSession" s SET "kind" = 'quick' WHERE s."cardioMinutes" > 0 AND NOT EXISTS (SELECT 1 FROM "WorkoutSet" w WHERE w."sessionId" = s."id");

ALTER TABLE "WorkoutSet" ADD COLUMN "setType" TEXT NOT NULL DEFAULT 'normal';

CREATE TABLE "ExerciseNote" (
  "userId" UUID NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExerciseNote_pkey" PRIMARY KEY ("userId", "exerciseId")
);
ALTER TABLE "ExerciseNote" ADD CONSTRAINT "ExerciseNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- locked from the public Data API like every table (0002); only the API role reads it
ALTER TABLE public."ExerciseNote" ENABLE ROW LEVEL SECURITY;
