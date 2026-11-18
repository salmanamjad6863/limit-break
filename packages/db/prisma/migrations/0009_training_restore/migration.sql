-- Sprint 8: everything a signed-in hunter needs restored on a new phone lives on the server.
ALTER TABLE "Profile" ADD COLUMN "activeProgramId" TEXT;
ALTER TABLE "Profile" ADD COLUMN "programStartedAt" TIMESTAMP(3);
ALTER TABLE "Profile" ADD COLUMN "avoidExercises" TEXT[] DEFAULT ARRAY[]::TEXT[];
