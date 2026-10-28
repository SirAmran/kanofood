"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { FeaturedCardView } from "@/lib/public/featured";

/**
 * The featured rail. The first thing a customer sees on screen 4.1.
 *
 * A native horizontal scroller with scroll snap, not a carousel library. Netflix
 * is the reference for the feel: one photograph at a time, a slow automatic
 * advance, arrows on a pointer device, and dots that are also buttons. The
 * browser does the scrolling, so a swipe on a low-end phone stays on the
 * compositor and the rail still works with JavaScript loading.
 *
 * **It stops when the customer takes over.** Hovering, focusing anything inside,
 * or hiding the tab pauses the timer for good; after a manual scroll the rail
 * does not pull itself out from under a thumb. With `prefers-reduced-motion` it
 * never starts.
 *
 * The index is read from the scroll position rather than kept only in state, so
 * a swipe and an arrow press agree with the dots. Animation is transform and
 * opacity only, per UX_SPEC section 2.
 */

const ADVANCE_MS = 7000;

export function FeaturedRail({ cards }: { readonly cards: readonly FeaturedCardView[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  /** The index the timer advances from. A ref because the interval must read
   * the newest value without being rebuilt on every slide. */
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

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
      rail.scrollTo({ left: slide.offsetLeft - rail.offsetLeft, behavior: "smooth" });
      setIndex(index);
    },
    [setIndex],
  );

  useEffect(() => {
    if (paused || cards.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const next = (activeRef.current + 1) % cards.length;
      const rail = railRef.current;
      const slide = rail?.children.item(next);
      if (rail && slide instanceof HTMLElement) {
        rail.scrollTo({ left: slide.offsetLeft - rail.offsetLeft, behavior: "smooth" });
      }
      setIndex(next);
    }, ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, [cards.length, paused, setIndex]);

  if (cards.length === 0) return null;

  return (
    <section
      className="sf-feature"
      aria-roledescription="carousel"
      aria-label="Featured food and drinks"
      onPointerEnter={() => setPaused(true)}
      onFocusCapture={() => setPaused(true)}
    >
      <div
        ref={railRef}
        className="sf-feature__rail"
        onPointerDown={() => setPaused(true)}
        onScroll={(event) => {
          const rail = event.currentTarget;
          const centre = rail.scrollLeft + rail.clientWidth / 2;
          let closest = 0;
          let distance = Number.POSITIVE_INFINITY;

          for (let index = 0; index < rail.children.length; index += 1) {
            const slide = rail.children.item(index);
            if (!(slide instanceof HTMLElement)) continue;
            const middle = slide.offsetLeft - rail.offsetLeft + slide.clientWidth / 2;
            const gap = Math.abs(middle - centre);
            if (gap < distance) {
              distance = gap;
              closest = index;
            }
          }

          setActive(closest);
          activeRef.current = closest;
        }}
      >
        {cards.map((card, index) => (
          <Link
            key={card.id}
            href={card.href}
            className={card.imageUrl ? "sf-feature__slide" : "sf-feature__slide sf-feature__slide--bare"}
            aria-label={`${card.title}${card.subtitle ? `, ${card.subtitle}` : ""}`}
            aria-roledescription="slide"
          >
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt=""
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
                decoding="async"
              />
            ) : null}

            <span className="sf-feature__shade" aria-hidden="true" />

            <span className="sf-feature__body">
              {card.badge ? <span className="sf-feature__badge">{card.badge}</span> : null}
              <span className="sf-feature__title">{card.title}</span>
              {card.subtitle ? <span className="sf-feature__sub">{card.subtitle}</span> : null}
              <span className="sf-feature__cta">
                Order now
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M5 12h13m-5.5-5.5L18 12l-5.5 5.5" />
                </svg>
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="sf-feature__controls">
        <button
          type="button"
          className="sf-feature__arrow"
          aria-label="Previous featured card"
          onClick={() => goTo((active - 1 + cards.length) % cards.length)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>

        <span className="sf-feature__dots" role="tablist" aria-label="Choose a featured card">
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              role="tab"
              className="sf-feature__dot"
              aria-label={card.title}
              aria-selected={index === active}
              onClick={() => {
                setPaused(true);
                goTo(index);
              }}
            />
          ))}
        </span>

        <button
          type="button"
          className="sf-feature__arrow"
          aria-label="Next featured card"
          onClick={() => goTo((active + 1) % cards.length)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>
      </div>
    </section>
  );
}
