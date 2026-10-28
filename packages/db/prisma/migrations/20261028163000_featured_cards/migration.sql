-- The home screen's featured rail.
--
-- One new table, purely additive: nothing existing is altered, so this is safe
-- to apply to a database with live data. The rail was previously derived from
-- order counts, which meant it could not show a dish nobody had ordered yet and
-- could not show a promotion at all. This table is the merchandising surface the
-- owner asked for: a photograph, a line of copy and a link, editable from the
-- admin console without a deploy.
--
-- Written by hand, like the rider, notification and settings migrations,
-- because `prisma migrate diff --from-config-datasource` answers P1001 on this
-- box. The shape below is derived from `schema.prisma` by hand and must stay in
-- step with it; `migrate diff` is what would normally prove that and cannot run
-- here.
--
-- No seed rows: the six starting cards live in the application as a fallback so
-- a fresh database still has a storefront, and an operator promotes them into
-- real rows with one button on the admin screen. That keeps the "seed creates
-- configuration, not content" rule in `prisma/seed.ts` intact.

-- CreateTable
CREATE TABLE "featured_cards" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "image_url" TEXT,
    "href" TEXT NOT NULL DEFAULT '/kitchens',
    "badge" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "featured_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "featured_cards_is_active_sort_order_idx" ON "featured_cards"("is_active", "sort_order");
