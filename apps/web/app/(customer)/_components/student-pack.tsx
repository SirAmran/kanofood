import Link from "next/link";

/**
 * The student pack, announced before it can be ordered.
 *
 * "Coming soon" is the whole point and is stated three times, in the eyebrow, the
 * badge and the action, because a promotion that looks orderable and is not is a
 * broken order flow. The prices are the owner's, written as copy rather than as
 * a product in the database: there is no pack to add to a cart yet, and a
 * disabled product row would be a second source for the same promise.
 *
 * It links to the help screen, where the contact numbers live, so a student who
 * wants it can ask rather than leaving the page with nowhere to go.
 */
export function StudentPack() {
  return (
    <section className="sf-student" aria-labelledby="student-pack-title">
      <img
        className="sf-student__image"
        src="/images/featured/chinese-fried-rice.webp"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <span className="sf-student__shade" aria-hidden="true" />

      <div className="sf-student__body">
        <span className="sf-student__eyebrow">Student pack · Coming soon</span>
        <h2 className="sf-student__title" id="student-pack-title">
          Big plate.
          <br />
          Small budget.
        </h2>
        <p className="sf-student__copy">
          A full meal under <strong>₦1,500</strong>, an egg on the side, and a drink for about{" "}
          <strong>₦500</strong>. Built for the walk between lectures.
        </p>

        <span className="sf-student__facts">
          <span className="sf-student__fact">Food under ₦1,500</span>
          <span className="sf-student__fact">+ 1 egg</span>
          <span className="sf-student__fact">Drink ~₦500</span>
        </span>

        <Link href="/help" className="sf-student__cta">
          Ask about it
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M5 12h13m-5.5-5.5L18 12l-5.5 5.5" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
