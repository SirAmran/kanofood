# Deployment

Phase 10. The decisions are in `docs/ARCHITECTURE.md` sections 10 and 11; this
file is the procedure that follows from them. It is written to be run by the
project owner, because the two actions that cannot live in the repository are
creating the Netlify site and performing a provider-side restore.

**Status, 2026-10-28:** the repository is ready for Netlify. No site has been
created, no production environment exists, and the restore drill and pool check
have not been run against a deployed URL. Those three are the remaining launch
actions, and each has a record table at the end of this file. Do not mark Phase
10 done until they say so.

## The shape

| Piece | Choice | What it owns |
|---|---|---|
| Application | Netlify, building from `SirAmran/kanofood` on push | Next.js runtime, functions, HTTPS, deploy previews |
| Database | Supabase Postgres, `eu-west-1` | data, pooling, backups |
| Images | Supabase Storage, public `media` bucket | menu and kitchen images |
| Source | GitHub, `main` is production | code and review |

One application, one deploy. There are no separate customer, kitchen, rider and
admin deployments; `apps/web` is all four route groups.

## Provider setup, once

### 1. Supabase

The project already exists (`docs/ARCHITECTURE.md` section 14). Confirm three
things before the first deploy:

1. **Pooled connection string.** Project settings -> Database -> Connection
   pooling. Use the transaction-mode pooler on port `6543`. This is
   `DATABASE_URL` for Netlify.
2. **Direct connection string.** The session connection on port `5432`, or the
   pooler's session mode if the direct host is IPv6-only from this machine. This
   is `DIRECT_URL`, and it is used only by migrations from a trusted machine. It
   does **not** belong in Netlify: the running app never uses it, and putting it
   there is one more place the unpooled credential can leak.
3. **Backups.** Project settings -> Database -> Backups. Note the retention. Run
   the restore drill below before trusting it. If point-in-time recovery is not
   on the plan, the daily backup and "restore to a new project" path is the
   backup, and the drill is still required.

### 2. Netlify

1. Add new project -> import `SirAmran/kanofood`.
2. If Netlify asks which site to deploy, choose `apps/web`. Leave the base
   directory unset: the repository root is where npm workspaces install, and the
   root `netlify.toml` states the build command and publish directory.
3. Node is set to `24` by `netlify.toml`, matching `engines` in the root
   `package.json`. Do not override it in the UI.
4. Deploy previews: point them at a **separate** database. A preview that writes
   to production is a production deploy with a random URL. If there is no second
   Supabase project or branch yet, disable deploy previews rather than share the
   production database.
5. Production branch: `main`.

Netlify installs its OpenNext adapter itself. Do not add
`@netlify/plugin-nextjs` to `package.json` and do not pin the adapter; Netlify's
Next documentation explains that the adapter is what tracks Next releases.

### 3. Environment variables

Values never go in this repository. Set them in Netlify under Project
configuration -> Environment variables, scoped per context.

| Name | Production | Deploy preview | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | yes, separate database | pooled string |
| `DIRECT_URL` | no | no | migrations only, trusted machine |
| `DATABASE_POOL_MAX` | optional | optional | defaults to 3; see below |
| `AUTH_JWT_SECRET` | yes | yes | |
| `AUTH_TOKEN_TTL` | optional | optional | defaults to `15m` |
| `ADMIN_TOKEN_TTL` | optional | optional | defaults to `5m` |
| `ORDER_TOKEN_SECRET` | yes | yes | separate from `AUTH_JWT_SECRET` |
| `BRAND_*` | yes | yes | undecided brand, read from config |
| `DELIVERY_DEFAULT_ZONE` | yes | yes | slug of the seeded zone |
| `PLATFORM_PHONE`, `PLATFORM_WHATSAPP` | optional | optional | admin settings can override |
| `EMAIL_PROVIDER_KEY`, `EMAIL_FROM` | yes | optional | internal mail only |
| `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `PUSH_VAPID_SUBJECT` | yes | optional | empty means push is skipped |
| `STORAGE_PROVIDER`, `STORAGE_KEY`, `STORAGE_SECRET` | yes | yes | `STORAGE_SECRET` is service-role, server only |
| `SHEETS_SYNC_ENABLED`, `SHEETS_WEBHOOK_URL`, `SHEETS_WEBHOOK_TOKEN` | yes | no | off unless exactly `true` |

`.env.example` carries every name. The admin settings screen reads some of these
as a fallback, but the environment is still where the secrets live.

## Migrations

Production migrations are `prisma migrate deploy`, through the root script:

```
npm run db:deploy
```

Run it from a trusted machine with `DIRECT_URL` set to the production direct
connection, **before** deploying code that needs the new schema. It is not run by
the Netlify build. A build that migrates is a build that can migrate the
production database from a deploy preview, and two concurrent builds race.

`npm run db:migrate` is `prisma migrate dev`. It creates a shadow database and is
for local schema work only. It is not a production command.

Schema policy is forward-only. A destructive change is two deploys: ship code
that no longer reads the column, then drop the column in a later migration. A
rollback of the application does not roll back a migration.

### First production data

Once, from a trusted machine with production `DATABASE_URL` and `DIRECT_URL`:

```
npm run db:deploy
npm run db:seed
npm run db:create-admin -- --phone <number> --name "<name>"
```

The seed creates the default delivery zone and no kitchens, users or menu
content: kitchens are an operational act and the menu is real business content.
If the seed is skipped, no address can be quoted and the storefront has nothing
to open with.

## The pool hazard

Serverless functions plus Postgres exhausts connections by default. The
mitigation has two halves, and both are in the repository:

1. `DATABASE_URL` is the pooled Supabase string.
2. Each process opens a small pool. `packages/db/src/pool.ts` defaults to **3**
   connections per instance; `DATABASE_POOL_MAX` can lower or raise it, up to 20.

The arithmetic is the operator's responsibility:

```
concurrent function instances x DATABASE_POOL_MAX  <=  provider connection limit - reserve
```

Three is chosen for a request that fires several Prisma queries in parallel, not
for a fleet of thousands. If the provider's pooler limit is small, lower
`DATABASE_POOL_MAX` to `1` rather than discovering the limit in production. The
pooler multiplexes, but it still has a maximum client count.

### Run the check

```
# Local, after `npm run dev`
npm run db:pool-check

# Deployed
POOL_CHECK_URL=https://your-site.netlify.app \
POOL_CHECK_MAX_CONNECTIONS=20 \
npm run db:pool-check
```

The script sends 60 concurrent requests at `/api/v1/health/ready` (override with
`POOL_CHECK_REQUESTS` and `POOL_CHECK_CONCURRENCY`) and samples
`pg_stat_activity` while they are in flight. It fails on any non-ready response
and when the connection delta exceeds the ceiling. `POOL_CHECK_MAX_CONNECTIONS`
is the provider ceiling or the fleet maximum; without it the ceiling is
`DATABASE_POOL_MAX x POOL_CHECK_INSTANCES` (default one instance).

Run it against production before launch, and again after any change to
`DATABASE_POOL_MAX`, the Supabase plan, or Netlify's concurrency. Record it:

| Date | Target | Pool max | Peak delta | Ceiling | Result |
|---|---|---|---|---|---|
| 2026-10-28 | `localhost:3100`, pooled `DATABASE_URL` | 3 | 1 | 3 | pass: 60 requests, 20 concurrent, 0 failures, p95 1699ms |
| 2026-10-28 | `localhost:3101`, direct `DATABASE_URL` | 3 | 2 | 3 | pass: same load, 0 failures, p95 1478ms; the cap is visible here |
| not run yet | Netlify production | | | | |

## The restore drill

An untested backup is not a backup. The restore is performed in the Supabase
dashboard; the script only verifies the result.

1. Choose a quiet moment. The source database keeps moving, and a restore is a
   photograph of one moment.
2. In Supabase, restore the production backup or point-in-time target into a
   **new scratch project**. Never restore over production.
3. Point `RESTORE_TARGET_URL` at the scratch project's direct connection. Set
   `RESTORE_SOURCE_URL` (or use `DIRECT_URL`) to the production direct
   connection.
4. Run:

   ```
   RESTORE_SOURCE_URL=<production direct> \
   RESTORE_TARGET_URL=<scratch direct> \
   npm run db:restore-drill
   ```

   It compares the table list, schema fingerprint (columns, indexes and
   constraints), latest applied migration, and every table's row count. A
   difference is a failure, not a warning.
5. If it passes, sign in to the scratch copy with a known admin, open one order,
   and confirm the menu images load. Those are the two things a row count cannot
   prove.
6. Record the date, restore point and result, then delete the scratch project.

| Date | Restore point | Target | Result | Notes |
|---|---|---|---|---|
| 2026-10-28 | same live database | direct vs pooled URL | pass | harness check only, not a restore: every query and comparison ran against identical data |
| not run yet | | | | a real provider restore is still required |

## After a deploy

Smoke checks, in order:

1. `GET /api/v1/health` returns `200` with `status: "ok"`.
2. `GET /api/v1/health/ready` returns `200` with the database check `ok`.
3. `/` renders the storefront and the seeded zone's delivery strip.
4. `/admin` reaches sign-in, and a real admin can sign in.
5. `/manifest.webmanifest` lists 192 and 512 icons, and installing the PWA
   succeeds on a phone.
6. One order can be placed in a test kitchen, moved through the kitchen and
   rider screens, and ends settled. Use real content, then clean the fixtures.
7. Email and push, if configured, record a delivery rather than an error.

## Rollback

Netlify keeps every deploy. Roll back to the previous production deploy in the
Netlify UI. The database is not rolled back; migrations are forward-only, which
is why a destructive change is split across two deploys. If a deploy and a
migration are ever rolled back together, restore the database from the backup
and accept the data loss between the restore point and the incident.

## Launch checklist

- [ ] Supabase pooled and direct strings confirmed, backups/PITR checked.
- [ ] Netlify site created from `main`, Node 24, root `netlify.toml` in use.
- [ ] Production environment variables set; deploy previews on a separate database.
- [ ] `db:deploy`, `db:seed` and `db:create-admin` run against production.
- [ ] Production deploy green and the smoke checks below pass.
- [ ] `db:pool-check` run against production, result recorded above.
- [ ] Restore drill run against a scratch project, result recorded above.
- [ ] Custom domain and its certificate, when the domain is chosen.

## What this file does not do

- It does not create the Netlify site, set secrets, or deploy. Those need the
  owner's account.
- It does not perform the provider restore. That needs the owner's Supabase
  account.
- It does not prove the maps or the client-side PWA in a browser. This machine
  has no browser driver; the HTTP walks in the phase commits prove the server
  render and the write paths.
