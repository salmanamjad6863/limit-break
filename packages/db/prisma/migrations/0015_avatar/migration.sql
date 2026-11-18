-- Avatar Forge (VISUALS.md §7 / docs/AVATAR.md): Essence balance, ledger, inventory, loadout.

ALTER TABLE "HunterState" ADD COLUMN "essence" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "EssenceLedger" (
    "id" SERIAL NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "localDate" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EssenceLedger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EssenceLedger_eventId_reason_key" ON "EssenceLedger"("eventId", "reason");
CREATE INDEX "EssenceLedger_userId_localDate_idx" ON "EssenceLedger"("userId", "localDate");
ALTER TABLE "EssenceLedger" ADD CONSTRAINT "EssenceLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CosmeticOwned" (
    "userId" UUID NOT NULL,
    "cosmeticId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticOwned_pkey" PRIMARY KEY ("userId","cosmeticId")
);
CREATE INDEX "CosmeticOwned_userId_idx" ON "CosmeticOwned"("userId");
ALTER TABLE "CosmeticOwned" ADD CONSTRAINT "CosmeticOwned_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AvatarLoadout" (
    "userId" UUID NOT NULL,
    "body" TEXT,
    "hair" TEXT,
    "outfit" TEXT,
    "accessory" TEXT,
    "aura" TEXT,
    "prop" TEXT,
    "frame" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarLoadout_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "AvatarLoadout" ADD CONSTRAINT "AvatarLoadout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EssenceLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CosmeticOwned" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AvatarLoadout" ENABLE ROW LEVEL SECURITY;
