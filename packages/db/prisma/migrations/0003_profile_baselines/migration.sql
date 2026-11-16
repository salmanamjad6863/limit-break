-- Sprint 2: Awakening Assessment baselines + notification opt-in
ALTER TABLE "Profile" ADD COLUMN "baselines" JSONB;
ALTER TABLE "Profile" ADD COLUMN "notificationsOptIn" BOOLEAN NOT NULL DEFAULT false;
