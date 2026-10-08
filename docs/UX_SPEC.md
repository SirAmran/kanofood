# KanoFood - UX Specification

Status: proposed, not yet approved
Date: 2026-10-06
Project name is temporary. The public brand is undecided and read from config.

---

## 1. Principles

1. **Speed on a bad connection.** Every screen has a useful state before its data
   arrives. Nothing blanks out.
2. **One decision per screen.** The customer never chooses between two things
   that could be sequenced.
3. **The action is the biggest thing on the page.** Accept, submit, picked up.
   No hunting.
4. **Show the money plainly.** What the customer hands the rider is stated in
   naira, in full, before submit and again at the door.
5. **Never a dead end.** Every error offers the next step, including a phone
   number, because the phone call is the reliable channel here.
6. **Built for a phone first.** Larger viewports are designed, not stretched.

## 2. Design system

Built before the screens, in `packages/ui`. Nothing is styled inline twice.

**The standard.** Held to the polish of Spotify and Netflix, not to "a website
that works". The full list lives in `packages/ui/README.md`; the parts that
change decisions here are: depth from lightness and a soft shadow rather than a
border on every card, one accent used sparingly, motion that decelerates on a
single curve, animation of transform and opacity only, skeletons that match the
final layout exactly, space reserved so nothing shifts, and a dark theme that is
designed rather than inverted. Both themes are checked against WCAG AA.

**The budget.** Development runs on a 4GB machine with a slow disk and the
product runs on low-end Android phones over Nigerian mobile data. Smoothness is
therefore spent deliberately: CSS transitions rather than an animation library,
no filter or blur animation during scroll, and no webfont until it earns its
first paint.

**Tokens.** CSS custom properties, one source, consumed by all route groups.

- Type scale: six steps, base 16px, no body text below 14px.
- Spacing scale: 4px base, steps at 4, 8, 12, 16, 24, 32, 48.
- Radii: small, medium, large, pill.
- Colour: semantic names only (surface, surface-raised, text, text-muted, border,
  accent, success, warning, danger). Brand values map onto the semantic names, so
  renaming the brand touches one file.
- Elevation: three levels.
- Motion: two durations, one easing. Respect `prefers-reduced-motion`.

**Components.**

Button (primary, secondary, ghost, danger; three sizes; loading and disabled
states), Input (text, phone, textarea, with label, help text, error text), Select,
Checkbox, Radio, Card, List row, Badge and status pill, Bottom sheet, Modal,
Toast, Alert, Avatar, Image with placeholder, Skeleton, Empty state, Error state,
Spinner, Tabs, Sticky action bar, Quantity stepper, Price row, Timeline.

**Status pills** map one-to-one to order states and carry a consistent colour and
label everywhere they appear, so a rider and an admin read the same word.

**Loading.** Skeletons that match the shape of the content, never a spinner alone
on a content page.

**Empty.** What is missing, why, and one action. "No orders yet" plus what makes
one appear.

**Error.** Plain language, no codes, no stack traces, and a retry. A phone number
is present on every customer-facing error.

**Success.** Confirms what happened and what happens next.

## 3. Responsive and accessibility

**Breakpoints.** Mobile up to 640. Tablet 641 to 1024. Desktop above 1024.

- Customer: mobile layout is the product. Tablet and desktop centre the content
  at a readable width and use the extra space for a two-column menu, never a
  stretched phone layout.
- Kitchen and admin: designed for desktop first, fully usable on a phone. Tables
  become stacked cards on mobile.
- Rider: mobile only. Not designed for desktop, but not broken on it.

**Accessibility.** Semantic landmarks, one h1 per page, real labels on every
input, visible focus rings, contrast meeting WCAG AA, touch targets at least
44px, errors announced to assistive technology, money written as text so screen
readers say "one thousand naira" not "100000".

---

## 4. Customer screens

### 4.1 Home

Purpose: orient and start an order.
Components: delivery location bar (top, always visible and editable), search
entry, category chips, nearby kitchens, popular items, delivery information strip.
Actions: change location, search, open a category, open a kitchen, open an item.
Loading: skeleton cards in the kitchen and item rails.
Empty: no kitchens in the zone, so explain the zone and offer to change location
or contact the platform.
Error: keep the last good content, show a non-blocking retry banner.
Success: content renders, location is remembered.
Responsive: single column mobile, two to three columns from tablet.

### 4.2 Search

Purpose: find food or a kitchen directly.
Components: search input with focus on entry, recent searches, results split into
kitchens and dishes.
Actions: type, clear, select a result, retry.
Loading: instant local filter, then remote results with a skeleton below.
Empty: "nothing matches" plus a suggestion and the popular items.
Error: inline message with retry, recent searches stay usable.
Success: results grouped and labelled.
Responsive: full width mobile, centred column on desktop.

### 4.3 Kitchen listing

Purpose: browse all open kitchens in the zone.
Components: filters (open now, category, delivery fee), kitchen cards with cover,
name, area, prep time and fee.
Actions: filter, sort, open a kitchen.
Loading: card skeletons.
Empty: no kitchens match the filters, with a one-tap clear.
Error: retry banner, filters preserved.
Success: grid renders.
Responsive: one column mobile, two tablet, three desktop.

### 4.4 Kitchen detail

Purpose: decide whether to order from this kitchen.
Components: cover image, name, open or closed badge, prep time, delivery fee for
the current location, description, address, menu preview, full menu entry.
Actions: open menu, open an item, call the kitchen.
Loading: header skeleton plus menu skeleton.
Empty: kitchen is closed, so state that plainly and offer other open kitchens.
Error: retry, and the kitchen phone number.
Success: full profile renders.
Responsive: single column, two-column introduction from tablet.

### 4.5 Menu

Purpose: choose items.
Components: category tabs or accordion, item rows with image, name, short
description, price, add control. Unavailable items are visibly disabled with a
reason.
Actions: change category, add, open item detail, view cart.
Loading: row skeletons per category.
Empty: menu not published yet, with the kitchen phone number.
Error: retry per category rather than the whole page.
Success: items render, cart updates optimistically then confirms.
Responsive: one column mobile, two columns desktop.

### 4.6 Food detail

Purpose: inspect one item before ordering.
Components: image, name, description, price, quantity stepper, optional notes,
kitchen name, add to cart.
Actions: set quantity, add notes, add to cart, go back.
Loading: image placeholder plus text skeleton.
Empty: item became unavailable, so say so and offer back to the menu.
Error: retry, item not added twice on a duplicate tap.
Success: cart confirmation with a view-cart action.
Responsive: bottom sheet on mobile, centred modal from tablet.

### 4.7 Cart

Purpose: review before committing.
Components: line items with quantity steppers and remove, subtotal, delivery fee,
total, one-kitchen notice, delivery location summary, continue action.
Actions: change quantity, remove, clear, continue to checkout.
Loading: skeleton rows, totals resolved before the button enables.
Empty: "your cart is empty" with a link back to browsing.
Error: a removed or unavailable item is flagged inline with the option to remove
it and continue.
Success: totals correct, continue enabled.
Responsive: sticky total bar at the bottom on mobile.

### 4.8 Location selection

Purpose: capture where the food goes, in a landmark-first market.
Components: map with a draggable pin, "use my current location", manual address
field, landmark field, delivery instructions, phone number, saved locations if an
account exists later.
Actions: drag the pin, use GPS, type an address, save, confirm.
Loading: map tiles load with a skeleton; the GPS button shows progress.
Empty: no location yet, with the map centred on Kano by default.
Error: GPS denied or unavailable falls back to manual entry with a clear
explanation. A point outside every active zone states that and offers the
platform phone number.
Success: address and fee are shown before confirming.
Responsive: full-screen map on mobile, map plus form side by side on desktop.

### 4.9 Checkout

Purpose: collect the customer and confirm the order.
Components: name, phone, address summary with an edit action, landmark,
instructions, order summary, delivery fee, total, cash-on-delivery notice,
"we will call you to confirm" notice, place order.
Actions: edit details, place order.
Loading: submit disables and shows progress, and cannot be double-submitted.
Error: field-level validation with a clear message per field. Network failure
preserves everything typed and offers retry.
Success: goes to order confirmation. The order is never silently lost.
Responsive: single column mobile, summary sticky from tablet.

### 4.10 Order confirmation

Purpose: tell the customer exactly what happens next.
Components: order number, items and total, cash to hand the rider, delivery
address, an explicit "we will call you on this number to confirm" line, expected
timeframe, save or share the tracking link, contact the platform.
Actions: copy or share tracking link, call the platform, continue browsing.
Loading: not applicable, this is the result of a successful submit.
Empty: not applicable.
Error: if confirmation cannot be recorded, the order is still placed and the
customer is told to expect the call, with the order number shown.
Success: order number visible and shareable.
Responsive: single column, generous type, one clear action.

### 4.11 Order tracking

Purpose: answer "where is my food" without a phone call.
Components: status timeline with timestamps, current status in large type, rider
name and phone once assigned, kitchen phone, order summary, cancel request if
allowed, help.
Actions: call rider, call kitchen, call platform, request cancellation, refresh.
Loading: skeleton timeline.
Empty: unknown order number, with a clear explanation and a phone number.
Error: keep the last known status, show a last-updated time, allow refresh.
Success: timeline reflects the event log.
Responsive: single column, sticky current status on mobile.

### 4.12 Cancellation

Purpose: cancel cleanly and capture why.
Components: reason list, optional explanation, what happens next notice, confirm.
Actions: choose a reason, add detail, confirm, go back.
Loading: confirm disables and shows progress.
Empty: cancellation no longer allowed at this stage, explained plainly with a
phone number.
Error: cancellation failed, with retry and the platform phone number.
Success: cancelled status, confirmation, and the reason recorded.
Responsive: bottom sheet mobile, modal desktop.

### 4.13 Help and contact

Purpose: reach a human, because the phone is the reliable channel.
Components: platform phone number as the primary action, WhatsApp link if
enabled, FAQ, cancellation policy, delivery zone and fee explanation.
Actions: call, message, read a topic.
Loading: static, no loading state required.
Empty: not applicable.
Error: not applicable, content is local.
Success: not applicable.
Responsive: single column, call action always within reach.

---

## 5. Kitchen screens

### 5.1 Sign in

Phone or email plus password. Single purpose, large fields, clear error on bad
credentials. No marketing content.

### 5.2 Dashboard

Open or closed toggle as the most prominent control, today's order count,
pending action count, today's sales, and the most recent orders. The toggle is a
single tap and reflects the real current state, never an optimistic guess.

### 5.3 Orders

Purpose: the working queue.
Components: tabs for New, Preparing, Ready, Completed. Each card shows order
number, items with quantities, total, delivery area, time placed, and how long it
has been waiting. New orders are visually loudest and update without a manual
refresh.
Actions: accept, reject with reason, advance to preparing, mark ready, open
detail.
Loading: card skeletons. Empty: "no orders right now" plus open or closed state.
Error: keep the list, banner with retry. Success: the card moves tab immediately.
Responsive: single column mobile, list plus detail pane on desktop.

### 5.4 Order detail and history

Full order, customer delivery information appropriate to the kitchen stage,
timeline of events, and the actions currently allowed. History is the same screen
filtered by date.

### 5.5 Menu

List grouped by category with image, price, and an availability switch per item.
Add item is always reachable. Reordering by drag on desktop, by move buttons on
mobile.

### 5.6 Menu item editor

Name, description, price, category, photo, available toggle. Photo upload works
from a phone camera, shows progress, validates type and size, and never loses the
typed data on failure. A fallback image appears when none is set.

### 5.7 Kitchen status and settings

Open or closed, prep time, contact details, address and location pin, logo and
cover images. Changes save explicitly and confirm.

### 5.8 Basic analytics

Today, this week, this month: order count, gross sales, item sell-through,
average order value. Plain numbers, no chart that is not earning its space.

---

## 6. Rider screens

### 6.1 Sign in

As kitchen sign in, sized for one hand.

### 6.2 Today's deliveries

Purpose: the whole job, on one screen.
Components: a list ordered by urgency. Each card shows order number, kitchen name
and area, customer name, customer phone as a tappable call action, destination
address and landmark, the amount to collect in large type, the current status,
and one primary action button matching the next step.
Actions: call, navigate, mark picked up, mark out for delivery, mark delivered,
report failure.
Loading: card skeletons. Empty: "no deliveries assigned" plus refresh.
Error: retry, and the last known list stays visible. Success: the card updates in
place and the next action becomes available.
Responsive: mobile only by design. Large buttons, high contrast, readable in
daylight.

### 6.3 Delivery detail

Full order contents, both addresses, both phone numbers, navigation, notes,
timeline, and the full cash amount with a breakdown of what is being collected.

### 6.4 Cash recording

Amount collected, confirmation, and a warning if it differs from the expected
amount. Cash handed over to the platform is recorded separately with who
received it, so the rider's float is always visible.

### 6.5 Report a failure

Reason list (customer unreachable, wrong address, refused, paid issue, other),
optional note, and what happens next. A failed delivery is never a dead end:
the order remains visible for the admin to resolve.

---

## 7. Admin screens

### 7.1 Sign in

As above. Admin sessions are the most protected: shorter token lifetime.

### 7.2 Dashboard

Purpose: what is happening right now.
Components: live counters for pending confirmation, preparing, out for delivery,
delivered today, cancelled today, failed today. Delivery revenue, food value,
cash collected, outstanding cash. The pending confirmation queue is the primary
work queue and sits above the metrics, because it is the only thing that needs a
human immediately.
Actions: open an order, confirm, assign a rider, call a customer.
Loading: metric skeletons. Empty: all counters at zero, with a clear "no orders
yet today". Error: banner with retry, last values retained and marked stale.
Success: counters update live.
Responsive: metric grid collapses to two columns on mobile, three or four on
desktop.

### 7.3 Orders

All orders with filters by date, kitchen, rider and status, plus free search by
order number or phone. Bulk view for the day's operations.

### 7.4 Order detail

Full order, customer, kitchen, rider, money breakdown, the complete event
timeline with actor and timestamp, and the admin actions: confirm, assign rider,
override status, cancel with reason. Override is available but always recorded as
an admin action in the event log.

### 7.5 Kitchens

List with open or closed state, today's order count and sales. Detail covers
profile, menu, staff logins, commission rate and settlement model.

### 7.6 Riders

List with active or inactive, today's deliveries, cash in hand and cash handed
over. Detail covers profile, login, and delivery history.

### 7.7 Zones and fees

Map of zones with boundaries, base fee and distance tiers per zone, payment
requirement per zone, active toggle. This is where the ₦1,000 lives and where it
changes.

### 7.8 Cash and reconciliation

Per rider: collected today, handed over, outstanding float, with a record action
for each handover. Per order: expected against collected, with exceptions listed
first. The exception list is the point of the screen.

### 7.9 Settlements

Per kitchen: the period, gross, commission, net payable, settlement model, and a
record of payment with reference and date.

### 7.10 Cancellations and failures

Every cancellation with reason and who or what caused it, and every failed
delivery with its reason. This screen exists to find patterns, so it is filterable
by kitchen, rider and reason.

### 7.11 Analytics

Orders, revenue, delivery revenue, cancellation rate, average delivery time,
kitchen performance. Filters by date range, kitchen and rider.

### 7.12 Settings

Delivery zone defaults, order confirmation mode (manual call, later automated),
notification toggles, platform phone number, and branding: name, tagline, logo,
favicon and colours. Branding lives here so a rebrand is a settings change.

---

## 8. Cross-cutting behaviour

**Poor network.** Every list keeps its last successful content and marks it
stale. Every submit is retry-safe and never double-submits. Optimistic updates
are confirmed or rolled back, never left ambiguous.

**Language.** English. Nigerian naira formatting throughout. Kano area names
where a real place is meant.

**Time.** Server timestamps, displayed in local time, with relative times
("12 minutes ago") on operational screens and absolute times on financial ones.

**Phone as a first-class action.** Anywhere a human might need to call another
human, the number is a tap target. This is the product's reliability backstop.
