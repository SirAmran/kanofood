# KanoFood

A food delivery marketplace for Kano Metropolitan. Customers order from
independent kitchens, the platform delivers, cash is collected on delivery. Four
roles share one application: customer, kitchen, rider, admin.

The repository is named `KanoFood`. The platform trades as KFDs: the name,
tagline and colours are read from configuration, so a rename is a settings
change. The mark is the owner's artwork, committed under
`apps/web/public/brand/`; `BRAND_LOGO_URL` overrides it for a deployment that
runs on somebody else's face.

## Status

Phase 10, deployment. Phases 0 to 9 are built: the domain core, the versioned
API and authentication, admin, customer, kitchen, rider, notifications, Sheets
reporting and the Leaflet maps. The site is live at `https://kfds.netlify.app`
on Netlify and hosted PostgreSQL, with a readiness probe, a per-instance
connection pool and a pool check that has passed against production. What
remains is a real provider-side restore drill and the two Android apps;
`docs/DEPLOYMENT.md` lists both, with the procedure and the records.

## The specification

Three documents under `docs/` are the source of truth. Read them before changing
behaviour:

- `docs/ARCHITECTURE.md` - stack, schema, API, auth, notifications, deployment
- `docs/PRODUCT_SPEC.md` - business model, roles, flows, order lifecycle, money
- `docs/UX_SPEC.md` - every screen, design system, responsive and accessibility

`docs/DEPLOYMENT.md` is the deployment procedure: provider setup, environment
matrix, migrations, the pool check, the restore drill and rollback.

## Layout

```
apps/web                 Next.js application, four route groups
  app/(customer)         Public storefront. Owns /
  app/(kitchen)/kitchen  Kitchen dashboard.        /kitchen
  app/(rider)/rider      Rider app, mobile only.   /rider
  app/(admin)/admin      Operations console.       /admin
  app/api/v1             Route handlers, versioned
packages/core            Money, order state machine
packages/db              Prisma schema and client
packages/ui              Design system and tokens
```

One application with four route groups, not four applications: one install, one
deploy, one auth implementation, and route groups keep the bundles separated so a
customer never downloads the admin console.

## Rules the code enforces

Stated in `docs/PRODUCT_SPEC.md` section 13 and not negotiable:

1. One order belongs to exactly one kitchen.
2. An order never skips a state. The transition table is `packages/core`.
3. Money is integer kobo, held as a bigint. There is no other representation.
4. A settled order's financial snapshot never changes.
5. Cancellation after rider assignment is an admin action only.
6. A menu item price change never alters an existing order.
7. A closed kitchen cannot receive orders.
8. Unavailable items cannot be ordered.
9. Delivery fees come from a zone row, never from code.
10. No order is confirmed without a recorded confirmation event.

## Running it

Requires Node 24 or later.

```
npm install
cp .env.example .env      # then fill in DATABASE_URL and DIRECT_URL
npm run db:generate
npm run db:deploy         # applies the migrations that exist; db:migrate is for schema work
npm run db:seed
npm run dev
```

`npm run build` generates the Prisma client and then builds the application. It
does not need database credentials.

The first sign-in needs an admin; the seed deliberately creates no users:

```
npm run db:create-admin -- --phone 08012345678 --name "Owner"
```
