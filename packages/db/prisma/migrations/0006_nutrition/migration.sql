-- Sprint 6: real nutrition (SYSTEMS.md §2.10)
ALTER TABLE "Profile"
  ADD COLUMN "ratePerWeek" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "checkInDay" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "hideCalories" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "proteinOverrideG" DOUBLE PRECISION,
  ADD COLUMN "fatOverrideG" DOUBLE PRECISION;

-- existing users: start at the default rate for their goal
UPDATE "Profile" SET "ratePerWeek" = CASE WHEN "goal" = 'cut' THEN -0.005 WHEN "goal" = 'bulk' THEN 0.001 ELSE 0 END;

ALTER TABLE "Food" ADD COLUMN "servings" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "FoodLog" ADD COLUMN "servingLabel" TEXT;
ALTER TABLE "NutritionDay" ADD COLUMN "waterMl" INTEGER NOT NULL DEFAULT 0;
