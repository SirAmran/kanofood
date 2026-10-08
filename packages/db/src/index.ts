/**
 * Database package.
 *
 * Phase 1 creates the shape only. Phase 2 fills this with the client singleton
 * once the models exist in prisma/schema.prisma.
 *
 * When the client lands it is instantiated once and exported as a singleton.
 * This is not a style preference. Serverless functions plus Postgres is the
 * documented failure mode of this stack, and a fresh client per invocation
 * exhausts database connections under load. The pooled connection string and the
 * small per-instance pool both exist to blunt exactly that, and it has to be
 * verified under concurrent load before launch rather than assumed.
 * See docs/ARCHITECTURE.md section 10.
 */
export {};
