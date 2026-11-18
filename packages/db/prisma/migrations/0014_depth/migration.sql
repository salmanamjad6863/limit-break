-- Sprint 11: depth features (SYSTEMS.md §6) — measurements, private progress photos, meal templates, weekly debrief.

-- 1) Extra body measurements (waist/hip/neck already exist)
ALTER TABLE "BodyMetric" ADD COLUMN "chestCm" DOUBLE PRECISION;
ALTER TABLE "BodyMetric" ADD COLUMN "armCm" DOUBLE PRECISION;

-- 2) Progress photos. Files live in a PRIVATE Storage bucket `progress-photos` (objects at progress/{userId}/{id}.jpg).
--    Buckets can't be created safely from a migration: create it by hand (Storage -> New bucket, public OFF).
CREATE TABLE "ProgressPhoto" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "localDate" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProgressPhoto_userId_localDate_idx" ON "ProgressPhoto"("userId", "localDate");
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Meal templates
CREATE TABLE "MealTemplate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "meal" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MealTemplate_userId_idx" ON "MealTemplate"("userId");
ALTER TABLE "MealTemplate" ADD CONSTRAINT "MealTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Weekly debrief (private, System voice)
CREATE TABLE "WeeklyDebrief" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "weekStart" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyDebrief_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WeeklyDebrief_userId_weekStart_key" ON "WeeklyDebrief"("userId", "weekStart");
ALTER TABLE "WeeklyDebrief" ADD CONSTRAINT "WeeklyDebrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS on, no policies: only the API (service role / table owner) reads and writes.
ALTER TABLE "ProgressPhoto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MealTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyDebrief" ENABLE ROW LEVEL SECURITY;
