import Link from "next/link";
import { notFound } from "next/navigation";

import { formatNaira } from "@kanofood/core";
import { Alert, Media } from "@kanofood/ui";

import { readSavedLocation } from "@/lib/public/location";
import { getPublicKitchen } from "@/lib/public/kitchens";

import { ItemOrder } from "../../../../_components/item-order";

/**
 * One dish. Screen 4.6.
 *
 * A full route rather than a sheet, so the dish has its own URL and can be
 * shared. The kitchen is fetched whole because the menu query is the same one
 * the menu screen uses; a second, narrower query would be one more round trip
 * for the same row.
 */
export default async function ItemPage({
  params,
}: {
  readonly params: Promise<{ slug: string; itemId: string }>;
}) {
  const { slug, itemId } = await params;
  const location = await readSavedLocation();
  const point = location ? { lat: location.lat, lng: location.lng } : null;

  const detail = await getPublicKitchen(slug, point);
  if (!detail) notFound();

  const { kitchen, menu } = detail;
  const section = menu.find((entry) => entry.items.some((item) => item.id === itemId));
  const item = section?.items.find((entry) => entry.id === itemId);
  if (!section || !item) notFound();

  const ordering = kitchen.isOpen && item.isAvailable;

  return (
    <section className="sf-item">
      <Link href={`/kitchens/${kitchen.slug}/menu`} className="sf-back">
        ← {kitchen.name} menu
      </Link>

      <Media src={item.imageUrl} alt={item.name} shape="wide" fallback={null} priority />

      <div className="sf-hero">
        <p className="sf-tile__meta">{section.name}</p>
        <h1 className="sf-item__title">{item.name}</h1>
        <p className="sf-item__price">{formatNaira(item.priceKobo)}</p>
        {item.description ? <p className="sf-tile__meta">{item.description}</p> : null}
        <Link href={`/kitchens/${kitchen.slug}`} className="kf-link">
          View {kitchen.name}
        </Link>
      </div>

      {!kitchen.isOpen ? (
        <Alert tone="warning" title="The kitchen is closed">
          This dish can be ordered again when the kitchen reopens.
        </Alert>
      ) : !item.isAvailable ? (
        <Alert tone="info" title="Not available right now">
          The kitchen has taken this dish off the menu for the moment.
        </Alert>
      ) : null}

      <ItemOrder
        kitchenSlug={kitchen.slug}
        kitchenName={kitchen.name}
        item={{ id: item.id, name: item.name, priceKobo: item.priceKobo.toString() }}
        available={ordering}
        disabledReason={
          kitchen.isOpen ? "Not available right now" : "The kitchen is closed right now"
        }
      />
    </section>
  );
}
