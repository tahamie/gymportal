# PostgreSQL Repository Plan

GymFlow now has a repository provider boundary. The app defaults to the file-backed development provider, while the PostgreSQL provider has central and tenant pool resolution ready for database-backed environments.

## Runtime Switch

- `GYMFLOW_REPOSITORY=file` uses `backend/data/dev-store.json`.
- `GYMFLOW_REPOSITORY=postgres` enables the PostgreSQL provider.
- `DATABASE_URL` will point to the central platform database.
- `TENANT_DATABASE_URL_TEMPLATE` will resolve tenant databases from the authenticated `tenant.databaseName`.
- `POSTGRES_ADMIN_DATABASE_URL` can point to an admin-capable database for `CREATE DATABASE`; if omitted, `DATABASE_URL` is used.

`TENANT_DATABASE_URL_TEMPLATE` must include either `{databaseName}` or `{database}`. Example:

```text
postgres://gymflow:password@localhost:5432/{databaseName}
```

## Provider Boundary

- Auth repository resolves users.
- Platform repository resolves tenants and Super Admin tenant lists from the central database.
- Members repository reads and updates members from the selected tenant database.
- Payments repository creates payments, receipts, and member balance updates inside the selected tenant database.

Tenant APIs must call only tenant repositories after tenant context is resolved. Platform APIs must not query member, payment, receipt, notification, or other tenant-private rows.

## PostgreSQL Work Remaining

Run this after creating the central database and the first tenant database:

```text
DATABASE_URL=postgres://gymflow:password@localhost:5432/gymflow_platform \
TENANT_DATABASE_URL_TEMPLATE=postgres://gymflow:password@localhost:5432/{databaseName} \
npm run backend:seed-postgres
```

The seed command applies rerunnable schemas and seeds:

- central `subscription_plans`, `tenants`, `platform_users`, and tenant stats
- FitZone tenant users, branches, plans, members, payments, receipts, renewals, and notification templates

## Super Admin Provisioning API

`POST /platform/tenants` provisions a tenant from the Super Admin portal.

Minimum body:

```json
{
  "name": "Pulse Gym Islamabad",
  "slug": "pulse-isb",
  "planCode": "growth",
  "adminName": "Maham Khan",
  "adminEmail": "admin@pulse.pk"
}
```

In PostgreSQL mode the endpoint:

1. creates the central tenant row
2. creates a provisioning job
3. creates the tenant database when missing
4. applies `backend/db/tenant.sql`
5. seeds the first tenant admin, branch, plans, and notification templates
6. marks the provisioning job completed or failed

Remaining production work:

1. Add password hashing and credential verification before production login.
2. Add integration tests with a disposable central database and tenant database.
3. Enable `GYMFLOW_REPOSITORY=postgres` for staging after tests pass.
