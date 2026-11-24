-- Own weekly routines (custom workouts): days with exact exercises, sets/reps, and a weekday schedule.

CREATE TABLE "CustomRoutine" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "days" JSONB NOT NULL,
    "schedule" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRoutine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomRoutine_userId_idx" ON "CustomRoutine"("userId");
ALTER TABLE "CustomRoutine" ADD CONSTRAINT "CustomRoutine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomRoutine" ENABLE ROW LEVEL SECURITY;
