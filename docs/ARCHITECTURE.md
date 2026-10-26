# KanoFood - Architecture

Status: approved 2026-10-08. Sections 9 and 14 were corrected 2026-10-09 where
they still described the storage provider as undecided.
Date: 2026-10-06
Project name is temporary. The public brand is undecided and lives in config.

---

## 1. Scope

A food delivery marketplace for Kano Metropolitan, Nigeria. Customers order from
independent kitchens, the platform delivers, cash is collected on delivery. Four
roles: customer, kitchen, rider, admin.

Version 1 optimises for a small real operation (a handful of kitchens, two
riders, the owner as admin). Every decision below is chosen so that scaling to
thousands of users and many riders is a configuration and capacity exercise, not
a rewrite.

## 2. Constraints

These shape the whole design and are not negotiable facts about the environment.

**Development machine.** Windows 10, 4GB RAM with roughly 0.5GB free, paging onto
a 5400rpm HDD measured at 94% busy and 407ms per transfer. Node 24 and npm 11 are
the only relevant toolchain installed. No Docker, no PostgreSQL, no Python on
PATH.

Consequences, all accepted deliberately:

- No local database service. Postgres is hosted. A local service would permanently
  consume RAM this machine does not have.
- No Docker. Container-based local stacks are off the table.
- No React Native. Metro plus the Android SDK would require a second toolchain
  competing for the same memory. The mobile app is a PWA, wrapped as a Trusted Web
  Activity for the Play Store later.
- Development will be slow. This is a known cost, not a surprise.

**Operating context.** Nigerian mobile networks and data cost. Landmark-based
addressing rather than street addresses. Cash on delivery rather than cards.
Phone calls, not email, as the reliable contact channel.

## 3. System architecture

One Next.js application serving four route groups, one API surface, one hosted
database.

```
                    +---------------------------+
   customer  -----> |  (customer)  PWA          |
   kitchen   -----> |  (kitchen)   dashboard    |      Next.js
   rider     -----> |  (rider)     mobile-first |      (one deploy)
   admin     -----> |  (admin)     operations   |
                    +-------------+-------------+
                                  |
                                  |  /api/v1/*
                                  |
                    +-------------v-------------+
                    |   route handlers          |
                    |   auth -> validation ->   |
                    |   domain -> persistence   |
                    +-------------+-------------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
     +--------v-------+  +--------v-------+  +--------v---------+
     |  PostgreSQL    |  |  object store  |  |  notification    |
     |  (hosted)      |  |  (images)      |  |  providers       |
     +----------------+  +----------------+  +------------------+

     packages/core  - order state machine, pricing, money
     packages/db    - Prisma schema, migrations, seed
     packages/ui    - design system
```

Why one app rather than four: shared design system, shared component code, one
install, one deploy, one auth implementation. Route groups keep the bundles
separated so a customer never downloads the admin dashboard.

## 4. Technology choices

| Choice | Why |
|---|---|
| TypeScript everywhere | One language across the whole codebase. No Python is installed on this machine, so the whole stack must be JavaScript. |
| Next.js, App Router | Server components keep the initial payload small on slow networks. Route groups give four apps in one build. Strong static and dynamic caching. |
| npm workspaces | npm is already installed. pnpm would be a better monorepo tool but is not present, and adding it costs disk and a learning step for no V1 benefit. |
| Prisma | Type-safe queries, real migrations, first-class Postgres. Its migration history is auditable, which matters for a project that will change schema often. |
| PostgreSQL | Relational integrity for money and order state. The domain is genuinely relational: orders reference kitchens, items, riders and payments. |
| Fastify (later only) | Not used in V1. Introduced only if a long-running background worker is needed (Sheets sync, notification retries). Next.js route handlers cannot run a persistent process. |

**Rejected alternatives**

- **Google Sheets as the database.** Explicitly ruled out. Sheets is a reporting
  integration, never the source of truth. The application must keep working when
  Sheets is unavailable.
- **React Native or Expo.** Rejected for V1 on hardware grounds, see section 2.
  Revisit only if the PWA is proven insufficient on real devices.
- **NestJS.** Heavy runtime and decorator overhead for a solo-maintained project.
  Structure comes from the folder layout and `packages/core`, not a framework.
- **MongoDB.** Money and order state want foreign keys and transactions.
- **Microservices.** A single deployable unit is correct at this scale. Splitting
  early multiplies operational cost for no benefit.

## 5. Database design

UUID primary keys. Foreign keys everywhere they are meaningful. `created_at` and
`updated_at` on every table. Money stored as `BIGINT` in kobo (see 5.1).

**Identity and access**

- `users` id, role (customer | kitchen_staff | rider | admin), phone unique
  nullable, email unique nullable, password_hash nullable, name, is_active
- `sessions` id, user_id, refresh_token_hash, expires_at, revoked_at, user_agent, ip
- `audit_logs` id, actor_user_id, actor_role, action, entity_type, entity_id,
  before jsonb, after jsonb, ip, user_agent, created_at

**Customer**

- `customers` id, user_id nullable, name, phone, created_at
- `addresses` id, customer_id, label, address_text, landmark, lat, lng,
  instructions, is_default

**Kitchen**

- `kitchens` id, name, slug unique, description, phone, logo_url, cover_url,
  address_text, landmark, lat, lng, is_open, is_active, prep_time_minutes,
  commission_rate nullable, created_at
- `kitchen_users` id, kitchen_id, user_id, role (owner | staff)
- `menu_categories` id, kitchen_id, name, sort_order, is_active
- `menu_items` id, kitchen_id, category_id, name, description, price_kobo,
  image_url, is_available, sort_order

**Zones and pricing**

- `delivery_zones` id, name, boundary jsonb, base_fee_kobo, payment_requirement
  (cod_allowed | prepaid_required), is_active, priority
- `delivery_fee_rules` id, zone_id, min_km, max_km, fee_kobo

Zone boundaries are stored as GeoJSON in `boundary`, with `delivery_fee_rules`
providing distance tiers inside a zone. Nothing about ₦1,000 exists anywhere in
code or schema. It is a row.

**Platform**

- `platform_settings` id (pinned to 1 by a CHECK), platform_phone,
  platform_whatsapp, updated_by_user_id, created_at, updated_at

One row, deliberately. It is the only `INTEGER` primary key in the schema,
because every other table has many rows and this one is a singleton: a second
row of platform settings is not a thing anybody wants to choose between. Prisma
cannot express a CHECK constraint, so `id = 1` is enforced in the migration and
flagged there, the same way the partial index is.

What is not in it matters as much as what is. Branding, session lifetimes, the
storage credentials and the notification provider keys stay in the environment
(see 11): they are read at startup by process-level code, so a form that wrote a
row would change a value nothing reads until the next restart. The contact
numbers are the exception because they are read while a customer is on a page,
and a number nobody answers is a reason a launch stops.

**Orders**

- `orders` id, order_number unique, customer_id, kitchen_id, status,
  address_snapshot jsonb, subtotal_kobo, delivery_fee_kobo, discount_kobo,
  total_kobo, payment_method, delivery_notes, placed_at, and one nullable
  timestamp per lifecycle state
- `order_items` id, order_id, menu_item_id nullable, name_snapshot,
  unit_price_snapshot_kobo, quantity, line_total_kobo, notes
- `order_events` id, order_id, from_status, to_status, actor_user_id, actor_role,
  reason, metadata jsonb, created_at

Two rules here are load bearing:

1. **Orders snapshot.** `address_snapshot`, `name_snapshot` and
   `unit_price_snapshot_kobo` freeze the order as placed. Editing a menu price or
   a saved address later must never rewrite history.
2. **`order_events` is the record, `orders.status` is a convenience.** Every
   transition appends an immutable event with actor, reason and timestamp. The
   current status column is a cache of the last event, kept so the admin "what is
   happening right now" query stays fast. If they ever disagree, the events win.

**Delivery**

- `deliveries` id, order_id unique, rider_id, assigned_at, picked_up_at,
  out_for_delivery_at, delivered_at, failed_at, failure_reason, distance_km,
  delivery_notes
- `riders` id, user_id, name, phone, vehicle, is_active, is_available

**Money**

- `payments` id, order_id, method (cod | transfer | card), amount_kobo, status,
  collected_by_rider_id, collected_at, reconciled_at, reconciled_by_user_id
- `cash_collections` id, rider_id, amount_kobo, collected_at, handed_over_at,
  received_by_user_id, status, notes
- `kitchen_settlements` id, kitchen_id, period_start, period_end,
  gross_kobo, commission_kobo, net_payable_kobo, model, status, paid_at,
  paid_by_user_id, reference

`kitchen_settlements.model` exists because two settlement arrangements are real,
per the brief:

- Model A: customer pays the rider, the platform owes the kitchen afterwards.
- Model B: the platform pays the kitchen upfront, the customer later pays the
  platform.

This is data, not a code branch. A kitchen's arrangement can change without a
deploy.

Derived and never stored: `amount_expected = total_kobo`,
`amount_collected = sum(payments.amount_kobo)`, `outstanding = expected -
collected`, `kitchen_amount = subtotal_kobo - commission`,
`delivery_revenue = delivery_fee_kobo`.

### 5.1 Money

**All money is `BIGINT` kobo.** One naira is 100 kobo. ₦1,000 is `100000`. No
floating point anywhere, ever, in schema, application code or API payloads.

`BIGINT` rather than `INT` because aggregate revenue over years exceeds the
2.1 billion kobo (roughly ₦21 million) ceiling of a 32-bit integer. Prisma maps
`BIGINT` to JavaScript `BigInt`, so the API layer must serialise BigInt
deliberately rather than relying on `JSON.stringify`, which throws on it. That
serialiser is written once in `packages/core` and used everywhere.

Alternative considered: Postgres `numeric` via Prisma `Decimal`. Exact, not
floating point, and more readable in the database. Rejected only because integer
kobo removes all rounding reasoning from the codebase, and Nigerian pricing is
already denominated in kobo.

### 5.2 Indexes

- `orders` (status, created_at), (kitchen_id, status), (customer_id),
  unique(order_number)
- `orders` partial index on non-terminal statuses, for the admin live view
- `order_events` (order_id, created_at)
- `menu_items` (kitchen_id, is_available)
- `deliveries` (rider_id, created_at), unique(order_id)
- `payments` (order_id), `cash_collections` (rider_id, status)
- `kitchen_settlements` (kitchen_id, status)
- `audit_logs` (entity_type, entity_id, created_at)

## 6. API

REST, versioned under `/api/v1`. JSON in, JSON out. No GraphQL: the access
patterns are known and REST caches better on the mobile networks this targets.

```
/api/v1/public/kitchens            browse, search, filter by zone
/api/v1/public/kitchens/:slug      detail plus menu
/api/v1/public/quote               delivery fee for a location, nothing stored
/api/v1/orders                     POST create (guest, no account)
/api/v1/orders/:number             GET by number plus phone, or signed token
/api/v1/orders/:number/cancel      POST with reason
/api/v1/kitchen/...                auth: kitchen_staff
/api/v1/rider/...                  auth: rider
/api/v1/admin/...                  auth: admin
/api/v1/notifications              GET this person's in-app inbox
/api/v1/notifications/read         POST mark some or all of it read
/api/v1/notifications/subscriptions  POST register this browser for push, DELETE forget it
```

Every handler runs the same pipeline: authenticate, authorise by role, validate
input against a schema, execute domain logic, persist, emit events.

**Guest order access.** A customer has no account. Creating an order returns a
signed, order-scoped token that grants read and cancel rights on that one order
and nothing else. This is what the tracking page uses, so a tracking link cannot
be guessed or widened by editing a URL.

**Validation.** Every request body and query is parsed by a schema before it
reaches domain code. Invalid input never touches the database.

## 7. Authentication and authorisation

- Staff (kitchen, rider, admin) sign in with phone or email plus password.
- Passwords hashed with scrypt (`node:crypto`), never stored, never logged.
  Originally specified as bcrypt or argon2id; changed to scrypt on 2026-10-09
  with the project owner's agreement. Native bcrypt and argon2id both need a
  compiler this machine does not have, pure-JS bcrypt is slower than what Node
  already ships, and scrypt is OpenSSL-native, adds no dependency, and is the
  next entry on the OWASP Password Storage cheat sheet after the two originally
  named. `apps/web/lib/auth/password.ts` is the only file that hashes, and the
  stored value is self-describing (`scrypt$N$r$p$salt$hash`), so a future swap is
  contained and existing passwords keep verifying.
- Access token: short-lived JWT, minutes not hours.
- Refresh token: rotated on every use, stored hashed in `sessions`, revocable.
- Both delivered as httpOnly, Secure, SameSite cookies.
- Customers: no credentials at all in V1. Signed order tokens only.

Authorisation is enforced **server side on every request**, from the session, not
from anything the client sends. Client-side role checks are for hiding UI, never
for protecting data. Every route group has a middleware that fails closed: a
missing or unparseable role is a denial.

This design leaves the door open for customer accounts later, which is a new
`customers.user_id` link and a login screen, not a data model change.

## 8. Notifications

One interface, several providers, chosen per event and per role.

```
notify(event, recipient, payload) -> queued -> provider -> result
```

- **In-app and Web Push** first. Free, works on the PWA, no per-message cost.
- **Email** second, as the audit channel and the reliable fallback.
- **Phone call** for order confirmation in V1. This is a human action, tracked as
  an order event, not an integration.
- **SMS and WhatsApp** behind the same interface, added later. These cost money
  per message and are therefore deferred, not forgotten.

Every notification is written to `notifications` with status, attempt count and
provider reference. A failed notification is visible, never silent. The
application never blocks on a notification: a delivery that succeeds while push
is down still succeeds.

Admin is notified immediately on every new order. Kitchen is notified when an
order needs its action. Customer notifications are added where practical.

**Built in Phase 9.** Nine statuses route, four are deliberately silent, and the
copy sits beside the routing in `packages/core/src/notifications.ts`, keyed by
status so a new status without a decision is a compile error. Dispatch runs after
the response (`after()`), one row per party and channel, written before any
provider is touched, with a unique `dedupe_key` so a retried request cannot say
the same thing twice.

- **In-app** is the row itself and the bell reads it.
- **Email** is Resend over its HTTP API; internal only, and a person with no
  address on file is `skipped` rather than `failed`.
- **Push** is Web Push through `web-push`, with a subscription registered from the
  browser and an endpoint the push service reports as gone (404 or 410) deleted
  rather than retried forever.
- **SMS and WhatsApp** have no provider. A channel with no provider is recorded as
  `skipped` with a reason, not hidden.

Every channel is inert until its keys are set, and every attempt is a row whatever
happens. The client half of push (manifest, service worker, subscribe button) is
built and has **never run in a browser**: there is no browser driver on this
machine yet, so what is proven is the endpoints and the server render.

## 9. Storage

Kitchen and food images go to object storage, not the filesystem and not the
database.

- Uploads validated by content type and magic bytes, not by file extension.
- Size limit enforced before the bytes are read.
- Images re-encoded and resized server side. Thumbnails generated.
- A fallback image is served when a kitchen has none.
- Deletion removes the object, not just the database row.

Provider is **Supabase Storage**, decided 2026-10-08. This paragraph previously
said the provider was undecided and that Netlify Blobs was the natural fit; the
decision went the other way. One `media` bucket with public read rather than
signed URLs, because menu and kitchen images are anonymous storefront content,
so a private bucket would add an expiring link per image per page load and hide
nothing. Bucket-level limits: 5 MB, and JPEG, PNG and WebP only. RLS stays
enabled on `storage.objects` with exactly one policy — public SELECT scoped to
`media` — and no write policies at all, so the publishable key cannot write.
Uploads and deletes are server side only, holding the service role key.

**A UUID in the object path is load-bearing, not cosmetic.** Supabase serves
public objects through an edge cache, so a deleted or replaced object can keep
answering at the same URL for a short window. A fresh path per upload sidesteps
it: `kitchens/<id>/logo.webp`, `menu-items/<id>/<uuid>.webp`. Verified
2026-10-08, when a deleted object still returned 200 from cache while the
authenticated read correctly returned 400.

The application half of this list — content validation, re-encoding, thumbnails,
the fallback image — is Phase 5. The bucket limits already refuse a wrong upload
before any of that exists.

## 10. Deployment

- **Source:** Git repository, hosted on GitHub.
- **Application:** Netlify, building from the repository on push.
- **Database:** hosted PostgreSQL, connection pooling required.
- **TLS:** provided by the host. HTTPS everywhere, no exceptions.

**The one real hazard:** serverless functions plus Postgres exhausts database
connections under load. This is not a theoretical concern, it is the standard
failure mode of this combination. Mitigation is a pooled connection string with a
small per-instance pool, and this must be verified under concurrent load before
launch rather than assumed.

Environments: local, preview (per pull request), production. Secrets live in the
host's environment configuration, never in the repository.

Backups: the database provider handles point-in-time recovery. A restore must be
actually performed once before launch. An untested backup is not a backup.

## 11. Environment variables

Names only. Values never appear in this repository, in documentation, or in any
note.

```
DATABASE_URL              pooled connection string
DIRECT_URL                unpooled, for migrations
AUTH_JWT_SECRET           signing key
AUTH_TOKEN_TTL            access token lifetime
ORDER_TOKEN_SECRET        signing key for guest order tokens
BRAND_NAME                public brand, currently undecided
BRAND_TAGLINE
BRAND_LOGO_URL
BRAND_FAVICON_URL
BRAND_COLOR_PRIMARY
BRAND_COLOR_ACCENT
DELIVERY_DEFAULT_ZONE     slug of the default zone
EMAIL_PROVIDER_KEY
EMAIL_FROM
PUSH_VAPID_PUBLIC_KEY
PUSH_VAPID_PRIVATE_KEY
PUSH_VAPID_SUBJECT        mailto: or https: contact for the push service
STORAGE_PROVIDER
STORAGE_KEY
STORAGE_SECRET
SHEETS_SYNC_ENABLED       off by default
SHEETS_WEBHOOK_URL        the Apps Script web app, ends in /exec
SHEETS_WEBHOOK_TOKEN      shared secret the script checks
```

`.env.example` carries every name with empty or placeholder values. `.env` is
gitignored from the first commit.

## 12. External integrations

**Google Sheets.** Reporting and operations only, never the database. The
application writes order and settlement summaries. Sync is asynchronous and
failure-tolerant: if Sheets is down, orders continue and the sync catches up.
`SHEETS_SYNC_ENABLED` defaults to off.

Writes go through a Google Apps Script web app (`docs/sheets/code.gs`) posted to
over HTTPS, decided 2026-10-25. The earlier plan used the Sheets API and needed
an OAuth scope grant, because the Sheets access already on this machine is
read-only. The Apps Script route removes that grant entirely: one deployed `/exec`
URL and one shared secret in the script and in `SHEETS_WEBHOOK_URL` and
`SHEETS_WEBHOOK_TOKEN`, both server side. Each row carries a stable key, so a
retry updates the row instead of appending a duplicate - which is what makes a
resync script a real catch-up rather than a second copy.

**Maps.** Location capture is a draggable pin on an OpenStreetMap tile layer via
Leaflet. Free, no API key, no per-load billing, and a pin is a better fit for
landmark addressing than a geocoder that expects street addresses. Google Maps is
a paid service and would need explicit approval.

**AI assistance.** Read-only analytical access is designed for, never write
access to money or order state. Exposed as a reporting API surface so an agent
can produce daily reports, cancellation analysis, delivery-time analysis and
reconciliation exceptions. No autonomous financial action, by design.

## 13. Scalability

What scales by configuration, with no rewrite:

- Riders: unbounded. `riders` and `deliveries` already model many-to-many over
  time. A rider assignment step exists from day one even though the owner is the
  only rider initially.
- Kitchens: unbounded, already isolated by `kitchen_id`.
- Zones and pricing: new rows, not new code.
- Notification channels: new providers behind an existing interface.
- Customer accounts: a nullable foreign key that is already there.

What will need real work later, and is deliberately not built now:

- Multi-kitchen carts. V1 puts one order against one kitchen. The `orders` to
  `kitchen_id` relationship is where a `order_groups` parent would later go.
- Dispatch and routing optimisation. Manual assignment is correct at two riders.
- Real-time push of status changes. V1 polls. Server-sent events or websockets
  come when polling is measurably the problem.

## 14. Open decisions

Carried explicitly rather than assumed:

1. **Database and storage providers.** **Resolved 2026-10-08: Supabase**, over
   Neon, for both. Neon gives the database only; Supabase answers the pooled
   Postgres in section 10 and the image storage in section 9 from one account.
   Project `xnezevjjhgrecpfjcbea`, region `eu-west-1` (Ireland), PostgreSQL
   17.11. The database is migrated and seeded and the bucket is created and
   verified. The 2026-10-08 correction that this did not block Phase 2 was
   right, and Phase 2 is now done.
2. **Public or private repository.** Also determines whether commits carry the
   `Co-Authored-By: Claude Code` trailer, which is currently parked in Active
   Priorities and conflicts with the standing rule that outbound copy reveals no
   machine authorship.
3. **Public brand.** Undecided by design. Everything reads from config, so this
   blocks nothing.
4. **Domain name.** Needed before the Play Store work, not before.

## 15. Phase plan

Phases 0 to 4 are the spine. 5 to 8 are the four interfaces. Then notifications,
Sheets, testing, deployment, Android and iOS. Testing happens at every phase
boundary, not only at the end.

**Written down 2026-10-09.** Until that date this list existed nowhere: the
project notes recorded Phases 1 and 2 and one line of prose giving the shape,
and this document had no phase section at all. Everything from Phase 3 on is
therefore a reconstruction drawn from sections 4, 6 and 7 and the two sibling
specifications, put to the project owner and confirmed. It is recorded here so
"what is next" has a real answer instead of a guess.

0. **Specification.** The three documents in `docs/`.
1. **Repository structure**, workspaces and tooling. Done.
2. **Database** — schema, migration, seed and object storage. Done 2026-10-08.
3. **The domain core, `packages/core`.** The order state machine, pricing and
   money, per the box under the diagram in section 3. Everything here is pure —
   no database, no network, no clock — which is what makes the money and
   lifecycle paths testable without a running system. PRODUCT_SPEC section 12.1
   requires automated tests on exactly those paths, so the tests ship with the
   phase rather than after it.
4. **API and authentication** — sections 6 and 7. The REST surface under
   `/api/v1`, guest order tokens, and role-based authorisation enforced server
   side on every request.
5. **Admin.** Live view, kitchens, menus and image upload.
6. **Customer.** Browse, cart, guest checkout, tracking. Built in six slices:
   (1) the customer order number in core; (2) the public browse API; (3) the
   order API; (4) storefront browsing, screens 4.1 to 4.6; (5) the order flow,
   screens 4.7 to 4.10; (6) after the order, screens 4.11 to 4.13. The status
   of each slice lives in the project notes, not here. **The slice split was
   written down on 2026-10-18, four days after the count first appeared in a
   status line**, and the screen grouping is a reconstruction anchored to what
   the browse and order APIs can answer rather than a recorded design; overrule
   it if the intended grouping differs.
7. **Kitchen.** The incoming-order queue, accept and reject, preparation status,
   menu management.
8. **Rider.** Today's deliveries, status updates, cash recording.
9. **Notifications** (section 8), then Google Sheets reporting.
10. **Deployment**, including the connection-pool check under concurrent load in
    section 10 and a restore actually performed once.
11. **Android**, as a Trusted Web Activity over the PWA. Then iOS.

**Why admin is fifth and not eighth.** `docs/UX_SPEC.md` lists the four
interfaces in the order customer, kitchen, rider, admin, and that order cannot be
built as written. A kitchen is created by an admin as an operational act, never
by a deployment, and the seed deliberately creates none — so a customer
storefront built first has no kitchen and no menu to show. Seeding a demo kitchen
to work around that would override the product decision rather than serve it.
Admin therefore comes first of the four, and the customer storefront follows with
real kitchens behind it. This is a deliberate departure from the document order,
recorded here rather than made silently.
