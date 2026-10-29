import Link from "next/link";

import { formatNaira } from "@kanofood/core";
import { Alert, EmptyState, Media, SectionHeader } from "@kanofood/ui";

import { readSavedLocation } from "@/lib/public/location";
import { loadFeaturedCards } from "@/lib/public/featured";
import { getPublicHome } from "@/lib/public/kitchens";

import { CategoryIcon } from "./_components/category-icon";
import { FeaturedRail } from "./_components/featured-rail";
import { KitchenTile } from "./_components/kitchen-tile";
import { StudentPack } from "./_components/student-pack";

/**
 * Customer home. Screen 4.1 in docs/UX_SPEC.md.
 *
 * The order is the order a person decides in: what looks good, what is near,
 * what is cheap tonight. A featured photograph leads because a storefront is a
 * shop window before it is a search box; the search entry is one line below it,
 * not hidden behind an icon.
 *
 * **Two rails, two different questions.** "Featured" is editorial and is
 * controlled on `/admin/featured`. "Popular" is counted from delivered orders
 * and stays honest by staying empty until somebody has actually ordered. The
 * home screen is not cached: the point is a cookie, the menus move, and a
 * highlight changed on a phone in the office should reach a customer on the next
 * request.
 *
 * The location bar itself belongs to the layout. This screen only reacts to
 * whether a point is known, because every fee and distance on it depends on
 * that.
 *
 * The lower half is reassurance and orientation, in the order a first-time
 * customer needs it: kitchens, popularity once there is any, how delivery works,
 * how an order runs, and one way into the full list.
 */

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M5 12h13m-5.5-5.5L18 12l-5.5 5.5" />
    </svg>
  );
}

export default async function CustomerHomePage() {
  const location = await readSavedLocation();
  const point = location ? { lat: location.lat, lng: location.lng } : null;
  const [home, featured] = await Promise.all([getPublicHome(point), loadFeaturedCards()]);

  const openCount = home.kitchens.filter((kitchen) => kitchen.isOpen).length;
  const area = home.zone?.name ?? "Kano Metropolitan";

  return (
    <>
      <section className="sf-hero">
        <div className="sf-hero__kicker">
          <span className="sf-status" data-tone={openCount > 0 ? "open" : "closed"}>
            <span className="sf-live-dot" aria-hidden="true" />
            {openCount > 0 ? "Open now" : "Closed right now"}
          </span>
          <span className="sf-hero__place">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
              <circle cx="12" cy="10" r="2.4" />
            </svg>
            {area}
          </span>
        </div>

        <h1 className="sf-hero__title">
          What are you <span className="sf-hero__accent">eating</span> today?
        </h1>
        <p className="sf-hero__sub">
          {location
            ? `Delivering to ${location.label}${home.zone ? ` in ${home.zone.name}` : ""}.`
            : "Set your location to see how close each kitchen is and what delivery costs."}
        </p>
      </section>

      {location && !home.deliverable ? (
        <Alert tone="warning" title="Not in a delivery zone yet">
          We do not deliver to {location.label} at the moment. You can still browse the kitchens.
        </Alert>
      ) : null}

      <Link href="/search" className="sf-search-entry">
        <span className="sf-search-entry__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <span className="sf-search-entry__label">Search kitchens or dishes</span>
        <span className="sf-search-entry__hint" aria-hidden="true">
          Try “jollof”
        </span>
      </Link>

      <ul className="sf-promises" aria-label="How ordering works">
        <li className="sf-promise">
          <span className="sf-promise__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="6" width="18" height="12" rx="2.5" />
              <circle cx="12" cy="12" r="2.6" />
              <path d="M6 9.5h.01M18 14.5h.01" />
            </svg>
          </span>
          <span className="sf-promise__text">
            <strong>Pay cash</strong>
            <span>When it reaches your door</span>
          </span>
        </li>
        <li className="sf-promise">
          <span className="sf-promise__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
              <circle cx="12" cy="10" r="2.4" />
            </svg>
          </span>
          <span className="sf-promise__text">
            <strong>Track every order</strong>
            <span>From the kitchen to your street</span>
          </span>
        </li>
        <li className="sf-promise">
          <span className="sf-promise__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 10 12 4l8 6v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-9Z" />
            </svg>
          </span>
          <span className="sf-promise__text">
            <strong>Kano kitchens</strong>
            <span>Cooked close to where you are</span>
          </span>
        </li>
      </ul>

      {featured.length > 0 ? (
        <section className="sf-section sf-section--featured">
          <SectionHeader
            title="Featured today"
            action={
              <Link href="/kitchens" className="kf-link">
                See all
              </Link>
            }
          />
          <FeaturedRail cards={featured} />
        </section>
      ) : null}

      {home.categories.length > 0 ? (
        <section className="sf-section sf-section--chips">
          <SectionHeader
            title="What are you craving?"
            action={
              <Link href="/kitchens" className="kf-link">
                Browse all
              </Link>
            }
          />
          <p className="sf-section__sub">Pick a craving and we will show you who cooks it.</p>
          <div className="sf-cats" role="list" aria-label="Categories">
            {home.categories.map((category) => (
              <Link
                key={category.name}
                role="listitem"
                href={`/kitchens?category=${encodeURIComponent(category.name)}`}
                className="sf-cat"
              >
                <span className="sf-cat__icon" aria-hidden="true">
                  <CategoryIcon name={category.name} />
                </span>
                <span className="sf-cat__name">{category.name}</span>
                <span className="sf-cat__count">
                  {category.kitchenCount} {category.kitchenCount === 1 ? "kitchen" : "kitchens"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <StudentPack />

      <section className="sf-section">
        <SectionHeader
          title="Kitchens near you"
          action={
            <Link href="/kitchens" className="kf-link">
              See all
            </Link>
          }
        />
        {home.kitchens.length === 0 ? (
          <EmptyState title="No kitchens yet">
            Nothing is listed for delivery right now. Check back shortly.
          </EmptyState>
        ) : (
          <div className="sf-rail sf-rail--kitchens">
            {home.kitchens.map((kitchen) => (
              <KitchenTile key={kitchen.id} kitchen={kitchen} />
            ))}
          </div>
        )}
      </section>

      {home.popular.length > 0 ? (
        <section className="sf-section">
          <SectionHeader
            title="Popular in Kano"
            action={
              <Link href="/kitchens" className="kf-link">
                Browse
              </Link>
            }
          />
          <div className="sf-rail sf-rail--dishes">
            {home.popular.map((item) => (
              <Link
                key={item.id}
                href={`/kitchens/${item.kitchenSlug}/menu/${item.id}`}
                className="sf-dish-card"
              >
                <Media
                  src={item.imageUrl}
                  alt=""
                  shape="square"
                  fallback={<span className="sf-dish-card__fallback">{item.name.slice(0, 1)}</span>}
                />
                <span className="sf-dish-card__body">
                  <span className="sf-dish-card__name">{item.name}</span>
                  <span className="sf-dish-card__meta">
                    {item.kitchenName} · ordered {item.orderedCount} times
                  </span>
                  <span className="sf-dish-card__price">{formatNaira(item.priceKobo)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sf-section" aria-labelledby="delivery-title">
        <div className="sf-delivery">
          <div className="sf-delivery__lead">
            <span className="sf-delivery__kicker">{area}</span>
            <h2 className="sf-delivery__title" id="delivery-title">
              How delivery works here
            </h2>
            <p className="sf-delivery__copy">
              Local kitchens, a quick confirmation call, and cash to the rider when the food
              arrives. No card, no wallet, no surprises.
            </p>
            <Link href="/help" className="sf-text-link">
              Delivery questions
              <Arrow />
            </Link>
          </div>
          <ul className="sf-delivery__facts">
            <li>
              <span>Delivery fee</span>
              <strong>{location ? "Shown on every kitchen" : "Set your location to see it"}</strong>
            </li>
            <li>
              <span>Payment</span>
              <strong>Cash on delivery</strong>
            </li>
            <li>
              <span>Confirmation</span>
              <strong>One quick call</strong>
            </li>
          </ul>
        </div>
      </section>

      <section className="sf-section">
        <SectionHeader title="From craving to doorstep" />
        <ol className="sf-steps">
          <li className="sf-step">
            <span className="sf-step__num" aria-hidden="true">
              1
            </span>
            <h3 className="sf-step__title">Pick a kitchen</h3>
            <p className="sf-step__copy">Browse what is open near you and compare delivery fees.</p>
          </li>
          <li className="sf-step">
            <span className="sf-step__num" aria-hidden="true">
              2
            </span>
            <h3 className="sf-step__title">Set your spot</h3>
            <p className="sf-step__copy">Drop a pin or pick your area so the rider can find you.</p>
          </li>
          <li className="sf-step">
            <span className="sf-step__num" aria-hidden="true">
              3
            </span>
            <h3 className="sf-step__title">Pay on arrival</h3>
            <p className="sf-step__copy">Hand the cash to the rider when the food is at your door.</p>
          </li>
        </ol>
      </section>

      <section className="sf-browse">
        <div className="sf-browse__body">
          <span className="sf-browse__kicker">Kano, sorted</span>
          <h2 className="sf-browse__title">Every open kitchen in one place.</h2>
          <p className="sf-browse__copy">Menus, prices and delivery fees, without the group chat.</p>
        </div>
        <Link href="/kitchens" className="sf-browse__button">
          Browse kitchens
          <Arrow />
        </Link>
      </section>
    </>
  );
}
