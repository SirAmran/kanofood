# Design system

The visual language for every surface in KanoFood: the customer storefront, the
kitchen dashboard, the rider app and the admin console.

Tokens live in `src/tokens.css`. They are CSS custom properties and they are the
only place a colour, size, radius or duration is written down. A component that
hardcodes `#10693f` instead of `var(--accent)` is a bug.

## The standard

The bar is the polish of Spotify and Netflix, not "a website that works". Those
products feel expensive for reasons that are mostly mechanical, and every one of
them is reproducible here:

1. **Depth, not borders.** Surfaces separate by lightness and a soft shadow. A
   hard 1px border on every card is the tell of a cheap interface.
2. **One accent, used sparingly.** Almost the whole screen is neutral. The brand
   colour earns attention because it is rare.
3. **Motion decelerates.** Everything arrives slightly slower than it left, on
   one easing curve. Snapping is what makes an app feel unfinished.
4. **Animate transform and opacity only.** Never width, height, top or margin.
   Those force a reflow on every frame, and this app runs on cheap Android phones
   on Nigerian mobile networks.
5. **Skeletons match the final layout exactly.** The placeholder is the shape of
   the content, so nothing jumps when the data lands. A spinner alone on a
   content page is not acceptable.
6. **Reserve space, never shift.** Every image sits in a fixed aspect ratio box
   and carries a background, so text never moves under the reader's thumb.
7. **Media fades in.** Images arrive with a short opacity transition over a
   placeholder. Nothing appears mid-paint.
8. **Tight headlines, generous body.** Negative tracking on large type, 1.55
   leading on paragraphs, and no body text below 14px.
9. **Every interactive element has a pressed state.** Press, hover, focus,
   disabled and loading. A control that does not react to a press feels dead.
10. **Dark mode is designed, not inverted.** Near-black ground, raised surfaces
    that step up in lightness, and a separate semantic colour set. Food
    photography is the reason this matters: it looks better on dark and the app
    should be beautiful in the mode people actually use at night.
11. **Contrast meets WCAG AA in both themes.** Both palettes are checked, not
    just the light one.
12. **Touch targets are at least 44px**, with real space between them, because
    the rider uses this one-handed on a motorbike.

## The hardware budget

This is a real constraint and it shapes choices above. Development runs on a 4GB
machine with a slow disk, and the product runs on low-end Android phones.

- Prefer CSS transitions over a JavaScript animation library.
- Never animate a blur or a filter during scroll.
- A long list is virtualised or paginated, never rendered whole.
- Ship no webfont until it is proven worth the first paint on a slow connection.

Smoothness is a budget. Spend it where the eye actually rests.

## Adding a component

Components arrive in Phase 4, in `src/`. Each one:

- reads tokens, never raw values
- has its pressed, focus, disabled and loading states defined up front
- is checked in both themes before it is considered done
- carries no layout assumptions about the screen it sits on
