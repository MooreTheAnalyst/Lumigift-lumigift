# ADR-0004: Database — PostgreSQL

**Date:** 2024-01-15  
**Status:** Accepted

## Context

Lumigift needs a persistent store for gift records, user accounts, payment references, and device-tracking data. Requirements:
- ACID transactions (gift creation + payment initiation must be atomic)
- Relational queries (gifts by sender, gifts by status, paginated cursors)
- Hosted managed service available on the target deployment platform (Vercel + cloud provider)
- Familiar to the team

## Decision

Use **PostgreSQL** as the primary database, accessed via the `pg` Node.js driver with raw SQL queries. Schema migrations are managed with plain `.sql` files in `migrations/`.

## Consequences

### Positive
- PostgreSQL's ACID guarantees prevent double-spend and partial-write scenarios in the gift lifecycle.
- Rich query capabilities (window functions, CTEs) support future analytics without an additional data warehouse.
- Managed PostgreSQL is available on all major cloud providers (Neon, Supabase, AWS RDS, Railway).
- The `pg` driver is lightweight and well-understood; no ORM abstraction layer to debug.
- Plain SQL migrations are portable and reviewable without framework-specific tooling.

### Negative
- Raw SQL requires manual query construction; no compile-time query validation (unlike Prisma or sqlc).
- Schema migrations must be applied manually or via a migration runner; no automatic rollback.
- Connection pooling must be managed carefully in serverless (Vercel) environments to avoid exhausting connections.

### Neutral
- Redis is used alongside PostgreSQL for OTP storage and idempotency keys (see `docs/ops/redis.md`).

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| MongoDB | Document model is a poor fit for relational gift/user/payment data; weaker transaction support |
| Prisma + PostgreSQL | Prisma adds value but also cold-start overhead in serverless; raw SQL keeps the bundle lean |
| PlanetScale (MySQL) | MySQL lacks some PostgreSQL features we rely on; PlanetScale's branching model is unnecessary complexity |
| SQLite | Not suitable for multi-instance serverless deployments |
