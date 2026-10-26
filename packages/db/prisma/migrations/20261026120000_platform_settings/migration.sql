-- Phase 10, the settings table.
--
-- One new table, purely additive: nothing existing is altered, so this is safe
-- to apply to a database with live data.
--
-- The gap it closes is the one Phase 5 recorded: nineteen models and not one of
-- them held a platform-level value, so admin screen 7.12 could only read. What
-- it holds is deliberately small. The contact numbers are operator settings
-- because they are read on a request path and change for operational reasons.
-- Branding, session lifetimes, storage and provider keys stay in the environment:
-- they are read at startup by process-level code, and a form that rewrote them
-- would appear to work and revert on the next request.
--
-- Written by hand, like the rider and notification migrations, because
-- `prisma migrate diff --from-config-datasource` answers P1001 on this box. The
-- shape below was derived from `schema.prisma` by hand and must stay in step with
-- it; `migrate diff` is what would normally prove that and cannot run here.
--
-- One thing below is raw SQL because Prisma cannot express it, the same class of
-- drift risk as the partial index in the init migration: a future
-- `prisma migrate dev` would see the CHECK, not find it in the schema, and
-- generate a migration that drops it. Never run `migrate dev` here.
--
--   1. The singleton CHECK, which is what makes this table a setting rather than
--      a list of candidate settings.

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "platform_phone" TEXT,
    "platform_whatsapp" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_settings_updated_by_user_id_idx" ON "platform_settings"("updated_by_user_id");

-- AddForeignKey
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The table holds one row and this is what says so. Without it the default of 1
-- is a convention a second writer can ignore; with it a second row is refused by
-- Postgres and the settings screen can never show one of two answers.
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_singleton" CHECK ("id" = 1);

-- The row is created here rather than by the first save, so the settings screen
-- reads a row that exists and an operator's first edit is an update rather than
-- a create. Both columns start null, which reads as "nothing is configured" and
-- lets the environment remain the fallback.
INSERT INTO "platform_settings" ("id", "updated_at") VALUES (1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
