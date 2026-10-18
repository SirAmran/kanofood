import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import { Badge, Media } from "@kanofood/ui";

import type { KitchenCard } from "@/lib/public/kitchens";

/**
 * One kitchen in a rail or list. Shared by home, browse and search so the same
 * kitchen cannot be described two different ways on two screens.
 *
 * A field the customer cannot know yet is omitted rather than guessed: without a
 * set location there is no fee and no distance, so the card says "Set location
 * for fee" once instead of leaving a dash where a number belongs.
 */
export function KitchenTile({
  kitchen,
  showLocation = true,
}: {
  readonly kitchen: KitchenCard;
  readonly showLocation?: boolean;
}) {
  const fee =
    kitchen.deliveryFeeKobo === null
      ? showLocation
        ? "Set location for fee"
        : null
      : `${formatNaira(kitchen.deliveryFeeKobo)} delivery`;

  const distance =
    kitchen.distanceKm === null ? null : `${kitchen.distanceKm.toFixed(1)} km away`;

  const prep = kitchen.prepTimeMinutes === null ? null : `~${kitchen.prepTimeMinutes} min`;

  return (
    <Link href={`/kitchens/${kitchen.slug}`} className="sf-tile">
      <Media
        src={kitchen.coverUrl ?? kitchen.logoUrl}
        alt=""
        shape="wide"
        fallback={<span className="sf-tile__fallback">{kitchen.name.slice(0, 1).toUpperCase()}</span>}
      />
      <div className="sf-tile__body">
        <div className="sf-tile__head">
          <span className="sf-tile__name">{kitchen.name}</span>
          <Badge tone={kitchen.isOpen ? "success" : "neutral"}>{kitchen.isOpen ? "Open" : "Closed"}</Badge>
        </div>
        {kitchen.area ? <span className="sf-tile__meta">{kitchen.area}</span> : null}
        <span className="sf-tile__meta">
          {[prep, fee, distance].filter(Boolean).join(" · ")}
        </span>
        {kitchen.categories.length > 0 ? (
          <span className="sf-tile__meta sf-tile__meta--muted">
            {kitchen.categories.slice(0, 3).join(" · ")}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
