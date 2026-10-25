-- Phase 9, notifications and Sheets.
--
-- Two tables, both new. Nothing existing is altered, so this migration is
-- purely additive and safe to apply to a database with live data.
--
-- `notifications` is the record section 8 promises: every notification is
-- written with its status, attempt count and provider reference, so one that
-- never left the building is visible rather than missing. `push_subscriptions`
-- is the storage the Web Push channel needs and nothing else does.
--
-- Written by hand, like the rider migration, because
-- `prisma migrate diff --from-config-datasource` answers P1001 on this box. The
-- shapes below were derived from `schema.prisma` by hand and must stay in step
-- with it; `migrate diff` is what would normally prove that and cannot run here.
--
-- Two things below are raw SQL because Prisma cannot express them. They are the
-- same class of drift risk as the partial index in the init migration: a future
-- `prisma migrate dev` would see them, not find them in the schema, and generate
-- a migration that drops them. Never run `migrate dev` here.
--
--   1. The CHECK constraints, which state the either/or recipient rule.
--   2. Nothing else. The indexes are all expressed in the schema.

-- CreateEnum
CREATE TYPE "NotificationRecipient" AS ENUM ('admin', 'kitchen', 'rider', 'customer');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'push', 'email', 'sms', 'whatsapp');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_status" "OrderStatus" NOT NULL,
    "recipient_type" "NotificationRecipient" NOT NULL,
    "user_id" UUID,
    "customer_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "provider_ref" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "customer_id" UUID,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_customer_id_created_at_idx" ON "notifications"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_created_at_idx" ON "notifications"("status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_order_id_idx" ON "notifications"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_customer_id_idx" ON "push_subscriptions"("customer_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The recipient is one person, in one place, or the other: a member of staff or
-- a rider has a `users` row, a guest customer does not and never will in V1.
-- A row with both or neither is a bug in the dispatcher, and it is cheap to make
-- the database refuse it rather than discover it in a report six weeks later.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_exactly_one" CHECK (
    ("recipient_type" = 'customer' AND "customer_id" IS NOT NULL AND "user_id" IS NULL)
    OR
    ("recipient_type" <> 'customer' AND "user_id" IS NOT NULL AND "customer_id" IS NULL)
);

-- The same either/or for a push endpoint, without a recipient type to tie it to.
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_target_exactly_one" CHECK (
    ("user_id" IS NOT NULL AND "customer_id" IS NULL)
    OR
    ("user_id" IS NULL AND "customer_id" IS NOT NULL)
);
