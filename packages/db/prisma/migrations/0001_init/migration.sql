-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rank" AS ENUM ('E', 'D', 'C', 'B', 'A', 'S', 'SOVEREIGN');

-- CreateEnum
CREATE TYPE "HeroClass" AS ENUM ('HYBRID', 'FIGHTER', 'ASSASSIN', 'JUGGERNAUT', 'RANGER', 'MONK');

-- CreateEnum
CREATE TYPE "TrainingLocation" AS ENUM ('HOME', 'GYM', 'HYBRID');

-- CreateEnum
CREATE TYPE "QuestKind" AS ENUM ('DAILY', 'MAIN', 'SIDE', 'BOSS', 'TRIAL', 'EVENT', 'HIDDEN', 'PENALTY');

-- CreateEnum
CREATE TYPE "QuestStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "hunterName" TEXT,
    "heroId" TEXT,
    "heroClass" "HeroClass",
    "sex" TEXT,
    "birthDate" DATE,
    "heightCm" DOUBLE PRECISION,
    "goal" TEXT,
    "experience" TEXT,
    "location" "TrainingLocation",
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "injuries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lifestyle" TEXT,
    "nutritionMode" TEXT NOT NULL DEFAULT 'full',
    "fatPreference" TEXT NOT NULL DEFAULT 'balanced',
    "daysPerWeek" INTEGER,
    "sessionMinutes" INTEGER,
    "questTime" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HunterState" (
    "userId" UUID NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "rank" "Rank" NOT NULL DEFAULT 'E',
    "apUnspent" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "shields" INTEGER NOT NULL DEFAULT 2,
    "str" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "agi" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "end" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "vit" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "spi" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HunterState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "localDate" TEXT NOT NULL,
    "clientTs" TIMESTAMP(3) NOT NULL,
    "serverTs" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flagged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpLedger" (
    "id" SERIAL NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "localDate" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "equipment" TEXT[],
    "primary" TEXT[],
    "secondary" TEXT[],
    "difficulty" INTEGER NOT NULL,
    "bwFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "restType" TEXT NOT NULL,
    "mediaKey" TEXT,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseLink" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "ExerciseLink_pkey" PRIMARY KEY ("fromId","toId","kind")
);

-- CreateTable
CREATE TABLE "WorkoutSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "plannedWorkoutId" TEXT,
    "localDate" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "plannedHardSets" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSet" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "reps" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "rir" INTEGER,
    "rpe" DOUBLE PRECISION,
    "durationS" INTEGER,
    "distanceM" DOUBLE PRECISION,
    "isWarmup" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "e1rmKg" DOUBLE PRECISION NOT NULL,
    "setId" UUID NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "achievedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestInstance" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "templateId" TEXT NOT NULL,
    "kind" "QuestKind" NOT NULL,
    "localDate" TEXT NOT NULL,
    "targets" JSONB NOT NULL,
    "progress" JSONB NOT NULL DEFAULT '{}',
    "status" "QuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QuestInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "barcode" TEXT,
    "kcal100" DOUBLE PRECISION NOT NULL,
    "p100" DOUBLE PRECISION NOT NULL,
    "c100" DOUBLE PRECISION NOT NULL,
    "f100" DOUBLE PRECISION NOT NULL,
    "alc100" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fiber100" DOUBLE PRECISION,
    "density" DOUBLE PRECISION,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" UUID,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "foodId" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "meal" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionDay" (
    "userId" UUID NOT NULL,
    "localDate" TEXT NOT NULL,
    "markedComplete" BOOLEAN NOT NULL DEFAULT false,
    "lowDayConfirm" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionDay_pkey" PRIMARY KEY ("userId","localDate")
);

-- CreateTable
CREATE TABLE "BodyMetric" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "localDate" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "bodyFatPct" DOUBLE PRECISION,
    "waistCm" DOUBLE PRECISION,
    "neckCm" DOUBLE PRECISION,
    "hipCm" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "BodyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TdeeEstimate" (
    "userId" UUID NOT NULL,
    "localDate" TEXT NOT NULL,
    "trendKg" DOUBLE PRECISION,
    "tdee" DOUBLE PRECISION NOT NULL,
    "observed" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TdeeEstimate_pkey" PRIMARY KEY ("userId","localDate")
);

-- CreateTable
CREATE TABLE "NutritionTarget" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "kcal" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fiberG" DOUBLE PRECISION NOT NULL,
    "goal" TEXT NOT NULL,
    "ratePerWeek" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "NutritionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "token" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "Event_userId_type_serverTs_idx" ON "Event"("userId", "type", "serverTs");

-- CreateIndex
CREATE INDEX "Event_userId_localDate_idx" ON "Event"("userId", "localDate");

-- CreateIndex
CREATE INDEX "XpLedger_userId_localDate_idx" ON "XpLedger"("userId", "localDate");

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_localDate_idx" ON "WorkoutSession"("userId", "localDate");

-- CreateIndex
CREATE INDEX "WorkoutSet_sessionId_idx" ON "WorkoutSet"("sessionId");

-- CreateIndex
CREATE INDEX "PersonalRecord_userId_exerciseId_achievedAt_idx" ON "PersonalRecord"("userId", "exerciseId", "achievedAt");

-- CreateIndex
CREATE INDEX "QuestInstance_userId_status_dueAt_idx" ON "QuestInstance"("userId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Food_barcode_key" ON "Food"("barcode");

-- CreateIndex
CREATE INDEX "Food_name_idx" ON "Food"("name");

-- CreateIndex
CREATE INDEX "FoodLog_userId_localDate_idx" ON "FoodLog"("userId", "localDate");

-- CreateIndex
CREATE INDEX "BodyMetric_userId_localDate_idx" ON "BodyMetric"("userId", "localDate");

-- CreateIndex
CREATE INDEX "NutritionTarget_userId_effectiveFrom_idx" ON "NutritionTarget"("userId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_userId_key_source_key" ON "Entitlement"("userId", "key", "source");

-- AddForeignKey
ALTER TABLE "HunterState" ADD CONSTRAINT "HunterState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpLedger" ADD CONSTRAINT "XpLedger_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseLink" ADD CONSTRAINT "ExerciseLink_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseLink" ADD CONSTRAINT "ExerciseLink_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestInstance" ADD CONSTRAINT "QuestInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLog" ADD CONSTRAINT "FoodLog_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLog" ADD CONSTRAINT "FoodLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyMetric" ADD CONSTRAINT "BodyMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdeeEstimate" ADD CONSTRAINT "TdeeEstimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionTarget" ADD CONSTRAINT "NutritionTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
