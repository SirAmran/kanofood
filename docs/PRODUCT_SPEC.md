# KanoFood - Product Specification

Status: proposed, not yet approved
Date: 2026-10-06
Project name is temporary. The public brand is undecided and read from config.

---

## 1. Business model

**What this is.** A marketplace connecting customers in Kano Metropolitan with
independent kitchens, with the platform handling delivery.

**Launch area.** Kano Metropolitan. Deliveries outside the initial zone are
possible and priced differently, and whether they are allowed at all is
configurable rather than hardcoded.

**Pricing.**

- Standard delivery fee within the supported Kano Metropolitan zone: ₦1,000.
- Outside the initial zone: additional charges, defined per zone.
- The ₦1,000 exists as a database row. It is not a constant in code.

**Payment.** Cash on delivery. No online payment in V1. No customer account
required to order.

**Revenue.** Delivery fees. Kitchen commission is supported in the schema but set
to zero at launch. Kitchens join free.

**Delivery operation.** The platform owner is the primary rider, with one trusted
backup. The architecture supports many riders from day one; only the roster
starts small.

**Vendors.** A small number of kitchens at launch. Adding a kitchen is an admin
action, not a deployment.

## 2. Roles

Four roles, each with its own entry point into the same application.

**Customer.** No account. Browses, orders, pays cash, tracks, can request
cancellation. Identified by phone number at checkout.

**Kitchen.** One dashboard per kitchen, one or more staff logins. Accepts or
rejects orders, manages the menu, controls open and closed status.

**Rider.** Mobile-first. Sees assigned deliveries, navigates, marks progress,
records cash collected, reports failures.

**Admin.** The platform owner. Sees everything happening now, manages kitchens,
riders and zones, reconciles money, overrides where judgement requires it.

### 2.1 Permission summary

| Action | Customer | Kitchen | Rider | Admin |
|---|---|---|---|---|
| Browse and search | yes | yes | yes | yes |
| Create order | yes | no | no | yes, on behalf |
| Confirm pending order | no | no | no | yes |
| Accept or reject order | no | yes | no | no |
| Update preparation status | no | yes | no | override |
| Assign rider | no | no | no | yes |
| Mark picked up, out, delivered | no | no | yes | override |
| Record cash collected | no | no | yes | yes |
| Cancel order | request | no | no | yes |
| Manage menu and prices | no | yes | no | no |
| Manage kitchens, riders, zones | no | no | no | yes |
| View revenue and reconciliation | no | own sales | own deliveries | yes |

## 3. Customer flow

```
Home
  -> choose delivery location
  -> browse or search
  -> select kitchen
  -> view menu
  -> add to cart
  -> review cart
  -> delivery details (name, phone, address, landmark, pin, instructions)
  -> order review
  -> cash on delivery confirmation
  -> submit
  -> PENDING_CONFIRMATION, we call to confirm
  -> confirmed, kitchen prepares
  -> picked up
  -> out for delivery
  -> delivered, cash collected
```

**One cart, one kitchen.** V1 deliberately does not support a cart spanning
multiple kitchens, because it multiplies delivery logistics for a young
operation. Trying to add an item from a second kitchen prompts to clear the cart
or start a new order. The data model leaves room for an order group later.

**Nothing is charged before delivery.** The final step before submit states
plainly what the customer will hand the rider, and that a confirmation call is
coming.

## 4. Kitchen flow

```
Sign in
  -> set open or closed
  -> menu ready
  -> order arrives (notified)
  -> read the order
  -> ACCEPT or REJECT
       reject -> choose reason -> admin takes over
  -> PREPARING
  -> READY_FOR_PICKUP
  -> rider collects
```

Incoming orders are the primary screen and the loudest element on it. An order
shows number, items with quantities, total, delivery area, time placed and the
required action. Accept and reject are the two largest controls on the page.

Menu management is built for a phone held in one hand in a kitchen: add item,
photograph it, set a price, mark available or unavailable. Marking an item
unavailable must not require deleting it, because it is usually temporary.

## 5. Rider flow

```
Sign in
  -> today's deliveries, newest action first
  -> open a delivery
  -> call customer or open navigation
  -> mark picked up
  -> out for delivery
  -> delivered, record cash collected
       or report delivery failure with a reason
```

The rider screen answers one question: what do I do next. Everything else is
secondary. Large touch targets, no nested navigation, works one-handed.

## 6. Admin flow

```
Sign in
  -> dashboard: what is happening right now
  -> pending confirmations, the immediate work queue
  -> call the customer, confirm or cancel
  -> assign a rider
  -> watch delivery progress
  -> reconcile cash at end of day
  -> review analytics
```

The dashboard answers "what is happening right now" above all else. Historical
reporting is a separate view and never crowds the live one.

## 7. Order lifecycle

### 7.1 States

Active:

```
PENDING_CONFIRMATION   submitted, awaiting the confirmation call
CONFIRMED              customer reached and confirmed
KITCHEN_ACCEPTED       kitchen has taken the order
PREPARING              food being made
READY_FOR_PICKUP       waiting for the rider
RIDER_ASSIGNED         a rider owns this delivery
PICKED_UP              rider has the food
OUT_FOR_DELIVERY       en route to the customer
DELIVERED              handed over, cash collected
```

Terminal, unsuccessful:

```
CUSTOMER_CANCELLED
KITCHEN_REJECTED
ADMIN_CANCELLED
DELIVERY_FAILED
```

### 7.2 Allowed transitions

```
PENDING_CONFIRMATION -> CONFIRMED | CUSTOMER_CANCELLED | ADMIN_CANCELLED
CONFIRMED            -> KITCHEN_ACCEPTED | KITCHEN_REJECTED
                        | CUSTOMER_CANCELLED | ADMIN_CANCELLED
KITCHEN_ACCEPTED     -> PREPARING | CUSTOMER_CANCELLED | ADMIN_CANCELLED
PREPARING            -> READY_FOR_PICKUP | CUSTOMER_CANCELLED | ADMIN_CANCELLED
READY_FOR_PICKUP     -> RIDER_ASSIGNED | CUSTOMER_CANCELLED | ADMIN_CANCELLED
RIDER_ASSIGNED       -> PICKED_UP | ADMIN_CANCELLED
PICKED_UP            -> OUT_FOR_DELIVERY
OUT_FOR_DELIVERY     -> DELIVERED | DELIVERY_FAILED
```

Anything not listed is refused. The transition table lives in `packages/core` as
typed code, so an illegal transition is a compile-time or test-time failure, not
a production surprise.

**Customer cancellation stops at RIDER_ASSIGNED.** Once a rider is assigned and
committed, cancellation becomes an admin decision, because food has been made and
a person is already moving. This is a business rule, and it is deliberately
explicit rather than implied.

### 7.3 Every transition records

- `from_status`, `to_status`
- who did it: `actor_user_id` and `actor_role`
- why, where a reason is required
- when, as a server timestamp
- any metadata worth keeping

`order_events` is append-only. Nothing edits or deletes an event. If the cached
status column ever disagrees with the event log, the event log is correct.

## 8. Cancellation and rejection

**Customer cancellation** requires a reason from:

- Ordered by mistake
- Changed my mind
- Taking too long
- Kitchen unavailable
- Delivery taking too long
- Other

Plus an optional free-text explanation. Reason and timestamp are stored against
the order.

**Kitchen rejection** requires a reason. After a rejection the admin chooses one
of three actions, and none of them happens automatically:

1. Contact the customer and offer an alternative
2. Cancel the order
3. Suggest another kitchen

Substituting food or switching kitchens without the customer agreeing is not
permitted, in the product and in the code.

## 9. Confirmation calls

A submitted order does not become confirmed by itself. It lands in
`PENDING_CONFIRMATION` and the admin receives a notification.

Why: cash on delivery means an unconfirmed order is a real financial risk, and a
prank or mistaken order costs a kitchen real money. At launch volume a phone call
is the cheapest reliable filter.

The call outcome is recorded as an order event, including who called and when.

This is designed to be automated later without rewriting anything: the
notification layer already exists, so adding a customer-facing confirmation
message (SMS, WhatsApp) is a provider behind the existing interface, not a new
subsystem. The manual step becomes optional per configuration.

## 10. Money and settlement

### 10.1 Per order

Tracked per order:

- food subtotal
- delivery fee
- customer total
- amount expected
- amount collected
- amount outstanding
- payment method and status
- collection timestamp and who collected
- reconciliation status

Derived, not stored: outstanding is expected minus collected.

### 10.2 Settlement models

Two arrangements exist in the real operation and both are supported as data:

- **Model A:** customer pays the rider, platform, or kitchen directly, and the
  platform settles what it owes the kitchen afterwards.
- **Model B:** the platform pays the kitchen upfront, and the customer later pays
  the platform.

A kitchen carries its own model. It can change without a deployment. Settlement
records capture the period, gross, commission, net payable, who paid and when.

### 10.3 Cash reconciliation

The rider records cash collected per delivery. Cash physically handed to the
platform is recorded separately, along with who received it. The difference
between collected and handed over is the outstanding float, and it is visible on
the admin dashboard rather than discovered at month end.

## 11. Delivery zones and pricing

A zone has a name, a boundary, a base fee, a payment requirement and an active
flag. Fee rules allow distance tiers inside a zone.

```
0 to 3 km    X
3 to 5 km    Y
5 to 8 km    Z
outside zone custom, or refused
```

Nothing about the current ₦1,000 is hardcoded. Changing the price is an admin
edit. Adding a zone is an admin edit. Whether an outside-zone order is accepted
at all, and whether it must be prepaid, is a per-zone property.

## 12. Scope

### 12.1 Version 1, in scope

- Four roles with authentication and server-side authorisation
- Kitchen and menu browsing, search, cart, guest checkout
- Manual confirmation call step
- Full order lifecycle with an immutable event log
- Kitchen dashboard: orders, menu, open and closed, basic sales
- Rider interface: today's deliveries, status updates, cash recording
- Admin: live view, order management, kitchens, riders, zones, fees
- COD financial records per order
- Delivery zone and fee configuration
- Configurable branding
- Image upload with validation and optimisation
- Notifications: in-app, push, email, and the manual call step
- Automated tests on the critical money and lifecycle paths
- Deployment with HTTPS, backups and a tested restore

### 12.2 Version 1, explicitly out of scope

Each of these is a deliberate omission with a reason, not an oversight.

- Online payment. Cash on delivery is the operating model at launch.
- Customer accounts. Guest ordering is faster for the customer and simpler for
  the operator. The schema is ready for accounts.
- Multi-kitchen carts.
- Riders choosing their own deliveries. Manual assignment is correct at two.
- Real-time status streaming. Polling first, prove the need.
- Ratings and reviews. Requires order volume to be meaningful.
- Promotions and discount codes. `discount_kobo` exists in the schema, unused.
- Loyalty, referrals, wallets.
- iOS. The backend supports it; the client work is later.

### 12.3 Later, in rough order

1. Google Sheets reporting sync
2. SMS and WhatsApp notifications, replacing or reducing the manual call
3. Customer accounts and saved addresses
4. Rider self-service and a dispatch queue
5. Kitchen commission on
6. Android release on the Play Store
7. iOS
8. Multi-kitchen orders
9. Automated dispatch and route optimisation

## 13. Business rules the code must enforce

Stated once, in one place, so they cannot drift:

1. One order belongs to exactly one kitchen.
2. An order never skips a state.
3. Money is integer kobo. There is no other representation.
4. A settled order's financial snapshot never changes.
5. Cancellation after rider assignment is an admin action only.
6. A menu item price change never alters an existing order.
7. A kitchen that is closed cannot receive orders.
8. Unavailable items cannot be ordered.
9. Delivery fees come from a zone row, never from code.
10. No order is confirmed without a recorded confirmation event.
