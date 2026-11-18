-- Integrity fixes: AP is paid once per level; edits reuse the finished cardio entries.

ALTER TABLE "HunterState" ADD COLUMN "apGrantedLevel" INTEGER NOT NULL DEFAULT 1;
UPDATE "HunterState" SET "apGrantedLevel" = "level";

ALTER TABLE "WorkoutSession" ADD COLUMN "cardio" JSONB;
