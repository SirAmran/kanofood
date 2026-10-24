-- Rider interface, Phase 8.
--
-- `deliveries.acknowledged_at` records that a rider has cleared a delivery off
-- their own list after the platform cancelled it underneath them. Nullable and
-- with no default, so every existing row reads as "still on the list", which is
-- true: nothing has been acknowledged yet.
--
-- Why a column rather than deleting the delivery row: the row is the record that
-- this rider was once carrying this order, and the cash and the history hang off
-- it. Acknowledging is the rider closing their own view of it, not an edit to
-- the order.
--
-- No index. The rider's list reads `WHERE rider_id = ? AND created_at >= ? AND
-- acknowledged_at IS NULL`, which the existing `deliveries_rider_id_created_at_idx`
-- already narrows to that rider's recent rows.

ALTER TABLE "deliveries" ADD COLUMN "acknowledged_at" TIMESTAMPTZ(3);
