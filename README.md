# KanoFood

A food delivery marketplace for Kano Metropolitan. Customers order from
independent kitchens, the platform delivers, cash is collected on delivery. Four
roles share one application: customer, kitchen, rider, admin.

The project name `KanoFood` is temporary. The public brand is undecided and is
read from configuration, so a rename touches settings and not code.

## Status

Phase 1, repository structure. The application is scaffolding: the route groups
exist and serve placeholder pages, and the money and order lifecycle modules in
`packages/core` are real. Nothing is deployed and there is no database yet.

## The specification

Three documents under `docs/` are the source of truth. Read them before changing
behaviour:

- `docs/ARCHITECTURE.md` - stack, schema, API, auth, notifications, deployment
- `docs/PRODUCT_SPEC.md` - business model, roles, flows, order lifecycle, money
- `docs/UX_SPEC.md` - every screen, design system, responsive and accessibility

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
npm run dev
```

Dependencies are not installed yet: Phase 1 wrote structure and nothing was
fetched. See `docs/ARCHITECTURE.md` section 2 for why the stack is shaped around
this machine.
