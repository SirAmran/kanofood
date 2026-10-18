import Link from "next/link";
import { notFound } from "next/navigation";

import { formatNaira } from "@kanofood/core";
import { Alert, Badge, Media } from "@kanofood/ui";

import { readSavedLocation } from "@/lib/public/location";
import { getPublicKitchen } from "@/lib/public/kitchens";

import { AddToCart } from "../../../_components/add-to-cart";

/**
 * Full menu. Screen 4.5.
 *
 * Sections are anchors rather than tabs that swap content, so every section is
 * in the page at once: searchable by the browser, reachable with back, and
 * printable. The sticky row of section names is navigation, not state.
 *
 * An unavailable dish is shown and disabled. The reason lives in the button's
 * title and beside the dish, because a customer who cannot find last week's
 * dish assumes it was dropped and stops looking.
 */
export default async function MenuPage({
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
  const ordering = kitchen.isOpen;

  return (
    <>
      <Link href={`/kitchens/${kitchen.slug}`} className="sf-back">
        ← {kitchen.name}
      </Link>

      <div className="sf-kitchen-hero__title-row">
        <h1 className="sf-kitchen-hero__title">Menu</h1>
        <Badge tone={kitchen.isOpen ? "success" : "neutral"}>
          {kitchen.isOpen ? "Open now" : "Closed"}
        </Badge>
      </div>

      {!ordering ? (
        <Alert tone="warning" title="Closed right now">
          You can browse, but nothing can be added to a cart until the kitchen reopens.
        </Alert>
      ) : null}

      {menu.length === 0 ? (
        <p className="sf-tile__meta">This kitchen has not published a menu yet.</p>
      ) : (
        <>
          {menu.length > 1 ? (
            <nav className="sf-menu-tabs" aria-label="Menu sections">
              {menu.map((section) => (
                <a key={section.id} href={`#section-${section.id}`} className="sf-menu-tab">
                  {section.name} ({section.items.length})
                </a>
              ))}
            </nav>
          ) : null}

          {menu.map((section) => (
            <section key={section.id} id={`section-${section.id}`} className="sf-section sf-section-anchor">
              <h2 className="sf-tile__name">{section.name}</h2>

              <div className="sf-dishes">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="sf-dish"
                    data-unavailable={item.isAvailable && ordering ? "false" : "true"}
                  >
                    <Media src={item.imageUrl} alt="" shape="thumb" fallback={null} />

                    <div className="sf-dish__body">
                      <Link href={`/kitchens/${kitchen.slug}/menu/${item.id}`} className="sf-dish__name">
                        {item.name}
                      </Link>
                      {item.description ? (
                        <span className="sf-dish__desc">{item.description}</span>
                      ) : null}
                      {item.isAvailable ? null : (
                        <span className="sf-dish__unavailable">Not available right now</span>
                      )}

                      <span className="sf-dish__foot">
                        <span className="sf-dish__price">{formatNaira(item.priceKobo)}</span>
                        <AddToCart
                          kitchenSlug={kitchen.slug}
                          kitchenName={kitchen.name}
                          item={{ id: item.id, name: item.name, priceKobo: item.priceKobo.toString() }}
                          available={item.isAvailable && ordering}
                          disabledReason={
                            ordering ? "Not available right now" : "The kitchen is closed right now"
                          }
                        />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
