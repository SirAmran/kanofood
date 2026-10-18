import Link from "next/link";
import { notFound } from "next/navigation";

import { formatNaira } from "@kanofood/core";
import { Alert, Badge, Media, SectionHeader } from "@kanofood/ui";

import { readSavedLocation } from "@/lib/public/location";
import { getPublicKitchen } from "@/lib/public/kitchens";

/**
 * Kitchen detail. Screen 4.4: the shopfront, the facts a customer checks
 * before committing, and a short preview of the menu that leads to screen 4.5.
 *
 * A closed kitchen still renders. Hiding it would make a customer think it had
 * disappeared; the badge and the alert say what is actually true.
 */
export default async function KitchenPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const location = await readSavedLocation();
  const point = location ? { lat: location.lat, lng: location.lng } : null;

  const detail = await getPublicKitchen(slug, point);
  if (!detail) notFound();

  const { kitchen, menu } = detail;
  const itemCount = menu.reduce((total, section) => total + section.items.length, 0);

  const facts = [
    kitchen.prepTimeMinutes === null ? null : `~${kitchen.prepTimeMinutes} min`,
    kitchen.deliveryFeeKobo === null ? null : `${formatNaira(kitchen.deliveryFeeKobo)} delivery`,
    kitchen.distanceKm === null ? null : `${kitchen.distanceKm.toFixed(1)} km away`,
    `${itemCount} ${itemCount === 1 ? "dish" : "dishes"}`,
  ].filter((fact): fact is string => fact !== null);

  return (
    <>
      <Link href="/kitchens" className="sf-back">
        ← All kitchens
      </Link>

      <section className="sf-kitchen-hero">
        <Media
          src={kitchen.coverUrl ?? kitchen.logoUrl}
          alt=""
          shape="wide"
          fallback={null}
          priority
        />

        <div className="sf-kitchen-hero__title-row">
          <h1 className="sf-kitchen-hero__title">{kitchen.name}</h1>
          <Badge tone={kitchen.isOpen ? "success" : "neutral"}>
            {kitchen.isOpen ? "Open now" : "Closed"}
          </Badge>
        </div>

        {kitchen.description ? <p className="sf-tile__meta">{kitchen.description}</p> : null}

        <div className="sf-kitchen-hero__facts">
          {kitchen.area ? <span className="sf-fact">{kitchen.area}</span> : null}
          {facts.map((fact) => (
            <span key={fact} className="sf-fact">
              {fact}
            </span>
          ))}
        </div>

        {kitchen.addressText ? (
          <p className="sf-tile__meta">
            {kitchen.addressText}
            {kitchen.landmark ? ` · near ${kitchen.landmark}` : ""}
          </p>
        ) : kitchen.landmark ? (
          <p className="sf-tile__meta">Near {kitchen.landmark}</p>
        ) : null}

        {kitchen.phone ? (
          <a href={`tel:${kitchen.phone}`} className="kf-link">
            Call the kitchen: {kitchen.phone}
          </a>
        ) : null}
      </section>

      {!kitchen.isOpen ? (
        <Alert tone="warning" title="Closed right now">
          You can browse the menu, but ordering reopens when the kitchen does.
        </Alert>
      ) : null}

      {location && kitchen.deliveryFeeKobo === null ? (
        <Alert tone="info" title="No delivery fee to show">
          {location.label} does not fall in a delivery zone for this kitchen yet.
        </Alert>
      ) : null}

      <section className="sf-section">
        <SectionHeader
          title="Menu"
          action={
            <Link href={`/kitchens/${kitchen.slug}/menu`} className="kf-link">
              See full menu
            </Link>
          }
        />

        {menu.length === 0 ? (
          <p className="sf-tile__meta">This kitchen has not published a menu yet.</p>
        ) : (
          menu.map((section) => (
            <div key={section.id} className="sf-section">
              <h3 className="sf-tile__name">{section.name}</h3>
              <div className="sf-dishes">
                {section.items.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    href={`/kitchens/${kitchen.slug}/menu/${item.id}`}
                    className="sf-dish"
                    data-unavailable={item.isAvailable && kitchen.isOpen ? "false" : "true"}
                  >
                    <Media src={item.imageUrl} alt="" shape="thumb" fallback={null} />
                    <span className="sf-dish__body">
                      <span className="sf-dish__name">{item.name}</span>
                      {item.description ? (
                        <span className="sf-dish__desc">{item.description}</span>
                      ) : null}
                      {item.isAvailable ? null : (
                        <span className="sf-dish__unavailable">Not available right now</span>
                      )}
                    </span>
                    <span className="sf-dish__price">{formatNaira(item.priceKobo)}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}
