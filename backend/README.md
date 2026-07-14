# GymFlow Backend Foundation

This folder defines the first backend contract for GymFlow.

## Recommended Stack

- Runtime: Node.js with TypeScript
- API framework: Fastify or NestJS
- Database: PostgreSQL
- ORM/query layer: Prisma or Drizzle
- Auth: JWT access token plus refresh token
- Jobs: queue worker for provisioning, renewals, notification retries, and tenant stats sync
- Messaging: WhatsApp BSP plus SMS provider for MVP

The frontend can continue using `src/services/mockGymFlow.ts` until real endpoints are ready.

## Current Local Persistence

The local backend uses a file-backed development database at:

- `backend/data/dev-store.json`

This gives the first backend endpoints real persistence across restarts without requiring PostgreSQL to be installed yet. The route handlers talk to repository functions, so this file store can later be replaced by PostgreSQL repositories while preserving the API surface.

Repository mode is controlled by:

- `GYMFLOW_REPOSITORY=file` default local development mode
- `GYMFLOW_REPOSITORY=postgres` PostgreSQL mode with central and tenant database pools

PostgreSQL mode also requires:

- `DATABASE_URL`
- `TENANT_DATABASE_URL_TEMPLATE`

Tenant database creation can also use:

- `POSTGRES_ADMIN_DATABASE_URL` optional; falls back to `DATABASE_URL`

Useful commands:

- `npm run backend:build`
- `npm run backend:start`
- `npm run backend:reset-db`
- `npm run backend:seed-postgres`
- `npm run backend:test`

## Backend Tests

The backend test suite uses Node's built-in test runner and starts the app on a random local port. It verifies:

- health check
- tenant login tenant-slug guard
- tenant member access with correct `X-Tenant-ID`
- tenant mismatch rejection
- Super Admin rejection from tenant APIs
- payment creation persistence
- member balance/status update after payment
- digital payment transaction ID requirement
- Super Admin tenant listing

## Surfaces

### Tenant API

Tenant Admin and Staff use tenant-scoped APIs.

Examples:
- `/tenant/members`
- `/tenant/payments`
- `/tenant/renewals`
- `/tenant/notifications`
- `/tenant/reports/summary`

Every tenant API request requires:
- authenticated user
- tenant role
- `X-Tenant-ID`
- resolved tenant database connection

### Platform API

Super Admin uses central platform APIs.

Examples:
- `/platform/tenants`
- `POST /platform/tenants`
- `/platform/plans`
- `/platform/tenant-stats`

Platform APIs use only the central database.

## File Map

- `contracts/openapi.yaml`: API contract for frontend/backend alignment
- `db/central.sql`: central platform database schema
- `db/tenant.sql`: tenant database template schema
- `docs/tenant-isolation.md`: hard rules for data separation
- `docs/postgres-repository-plan.md`: PostgreSQL repository wiring plan

## Implementation Sequence

1. Create backend app with TypeScript. Done.
2. Implement auth and role guards. Done.
3. Implement tenant resolver middleware. Done.
4. Add repository layer and local persistence. Done.
5. Create central database migrations. Drafted in `db/central.sql`.
6. Create tenant database template migrations. Drafted in `db/tenant.sql`.
7. Add repository provider switch. Done.
8. Replace file repositories with PostgreSQL repositories.
9. Add Super Admin tenant provisioning API. Done.
10. Implement renewals and notifications jobs.
11. Implement Super Admin tenant stats sync.
