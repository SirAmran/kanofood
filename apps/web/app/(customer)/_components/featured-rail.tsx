"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { FeaturedCardView } from "@/lib/public/featured";

/**
 * The featured rail. The first thing a customer sees on screen 4.1.
 *
 * A native horizontal scroller with scroll snap, not a carousel library. Netflix
 * is the reference for the feel: one photograph at a time, a slow automatic
 * advance, arrows on a pointer device, and a progress strip that is also the
 * control. The browser does the scrolling, so a swipe on a low-end phone stays
 * on the compositor and the rail still works with JavaScript loading.
 *
 * **It stops when the customer takes over.** Touching the rail, pressing an
 * arrow, choosing a progress step or focusing anything inside pauses the timer
 * for good; after a manual scroll the rail does not pull itself out from under a
 * thumb. Merely resting a pointer over it does not stop it, because then the
 * animation would look broken to every desktop visitor whose cursor happens to
 * sit on the page. With `prefers-reduced-motion` it never starts, and neither
 * the photograph nor the copy animates in.
 *
 * **Alignment is one calculation.** The rail snaps to centre and `goTo` scrolls
 * to the same centre, so a tap on the arrow, a swipe and the progress strip all
 * agree. The previous version snapped to centre but scrolled to the start, which
 * is why the active card sat a few pixels off every time the timer moved it.
 *
 * The index is read from the scroll position rather than kept only in state, so
 * a swipe and an arrow press agree with the controls. Animation is transform and
 * opacity only, per UX_SPEC section 2.
 */

const ADVANCE_MS = 7000;

export function FeaturedRail({ cards }: { readonly cards: readonly FeaturedCardView[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  /** The index the timer advances from. A ref because the interval must read
   * the newest value without being rebuilt on every slide. */
  const activeRef = useRef(0);
  const scrollTimer = useRef<number | null>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);

  const setIndex = useCallback((index: number) => {
    activeRef.current = index;
    setActive(index);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const rail = railRef.current;
      if (!rail) return;
      const slide = rail.children.item(index);
      if (!(slide instanceof HTMLElement)) return;

      // Centre the slide in the rail, then clamp to the real scroll range so the
      // first and last card do not ask the browser for a scroll that cannot exist.
      const target = slide.offsetLeft - (rail.clientWidth - slide.clientWidth) / 2;
      const max = rail.scrollWidth - rail.clientWidth;
      rail.scrollTo({ left: Math.max(0, Math.min(target, max)), behavior: "smooth" });
      setIndex(index);
    },
    [setIndex],
  );

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        setInView(entries[0]?.isIntersecting ?? true);
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    };
  }, []);

  useEffect(() => {
    if (paused || !inView || cards.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const next = (activeRef.current + 1) % cards.length;
      const rail = railRef.current;
      const slide = rail?.children.item(next);
      if (rail && slide instanceof HTMLElement) {
        const target = slide.offsetLeft - (rail.clientWidth - slide.clientWidth) / 2;
        const max = rail.scrollWidth - rail.clientWidth;
        rail.scrollTo({ left: Math.max(0, Math.min(target, max)), behavior: "smooth" });
      }
      setIndex(next);
    }, ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, [cards.length, inView, paused, setIndex]);

  if (cards.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      className="sf-feature"
      style={{ "--feature-interval": `${ADVANCE_MS}ms` } as unknown as CSSProperties}
      data-paused={paused || !inView}
      aria-roledescription="carousel"
      aria-label="Featured food and drinks"
      onFocusCapture={() => setPaused(true)}
    >
      <div
        ref={railRef}
        className="sf-feature__rail"
        onPointerDown={() => setPaused(true)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          setPaused(true);
          goTo(event.key === "ArrowLeft" ? (active - 1 + cards.length) % cards.length : (active + 1) % cards.length);
        }}
        onScroll={(event) => {
          // A smooth scroll fires dozens of events on the way to its target. If
          // the index changed on each one, every card's copy would restart its
          // entrance as it passed. Read the position once the rail settles.
          const rail = event.currentTarget;
          if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
          scrollTimer.current = window.setTimeout(() => {
            const centre = rail.scrollLeft + rail.clientWidth / 2;
            let closest = 0;
            let distance = Number.POSITIVE_INFINITY;

            for (let index = 0; index < rail.children.length; index += 1) {
              const slide = rail.children.item(index);
              if (!(slide instanceof HTMLElement)) continue;
              const middle = slide.offsetLeft + slide.clientWidth / 2;
              const gap = Math.abs(middle - centre);
              if (gap < distance) {
                distance = gap;
                closest = index;
              }
            }

            setIndex(closest);
          }, 90);
        }}
      >
        {cards.map((card, index) => (
          <Link
            key={card.id}
            href={card.href}
            className={card.imageUrl ? "sf-feature__slide" : "sf-feature__slide sf-feature__slide--bare"}
            data-active={index === active}
            aria-label={`${card.title}${card.subtitle ? `, ${card.subtitle}` : ""}`}
            aria-roledescription="slide"
          >
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt=""
                loading={index < 2 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                decoding="async"
              />
            ) : null}

            <span className="sf-feature__shade" aria-hidden="true" />

            <span className="sf-feature__top">
              {card.badge ? <span className="sf-feature__badge">{card.badge}</span> : <span />}
              <span className="sf-feature__index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")} <span>/ {String(cards.length).padStart(2, "0")}</span>
              </span>
            </span>

            <span className="sf-feature__body">
              <span className="sf-feature__title">{card.title}</span>
              {card.subtitle ? <span className="sf-feature__sub">{card.subtitle}</span> : null}
              <span className="sf-feature__cta">
                Order now
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M5 12h13m-5.5-5.5L18 12l-5.5 5.5" />
                </svg>
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="sf-feature__controls">
        <span className="sf-feature__ticks" role="tablist" aria-label="Choose a featured card">
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              role="tab"
              className="sf-feature__tick"
              aria-label={card.title}
              aria-selected={index === active}
              onClick={() => {
                setPaused(true);
                goTo(index);
              }}
            >
              <span className="sf-feature__tick-track">
                <span
                  key={index === active ? `active-${active}` : `rest-${index}`}
                  className="sf-feature__tick-fill"
                  data-past={index < active ? "true" : undefined}
                />
              </span>
            </button>
          ))}
        </span>

        <span className="sf-feature__count" aria-hidden="true">
          <strong>{String(active + 1).padStart(2, "0")}</strong> / {String(cards.length).padStart(2, "0")}
        </span>

        <span className="sf-feature__arrows">
          <button
            type="button"
            className="sf-feature__arrow"
            aria-label="Previous featured card"
            onClick={() => {
              setPaused(true);
              goTo((active - 1 + cards.length) % cards.length);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M15 5 8 12l7 7" />
            </svg>
          </button>
          <button
            type="button"
            className="sf-feature__arrow"
            aria-label="Next featured card"
            onClick={() => {
              setPaused(true);
              goTo((active + 1) % cards.length);
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        </span>
      </div>
    </section>
  );
}
