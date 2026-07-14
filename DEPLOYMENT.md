# GymFlow Deployment Notes

GymFlow is currently ready for a controlled demo / UAT deployment. It is not yet hardened for production go-live.

## Application Components

- Frontend: React + Vite
- Backend: Node.js HTTP API compiled from TypeScript
- Demo persistence: file-backed local store
- UAT / production persistence: PostgreSQL repository mode

## Build Commands

```bash
npm install
npm run typecheck
npm run lint
npm run backend:build
npm run build
npm run backend:test
```

## Frontend

The frontend build is generated into:

```text
dist/
```

For deployment, serve `dist/` with a static web server or CDN.

Set the backend API URL at build/runtime using:

```bash
VITE_GYMFLOW_API_BASE_URL=https://api.your-domain.com
VITE_GYMFLOW_API_MODE=backend
```

## Backend

Start the backend after compiling:

```bash
npm run backend:build
npm run backend:start
```

Default backend URL locally:

```text
http://127.0.0.1:4100
```

Health endpoint:

```text
GET /health
```

## Database

The database is not pushed as a live DB dump to GitHub.

What is pushed:

- `backend/db/central.sql`
- `backend/db/tenant.sql`
- `backend/src/scripts/seedPostgres.ts`
- repository code for file and PostgreSQL modes

What DevOps should provision separately:

- PostgreSQL server / managed PostgreSQL instance
- One central GymFlow database
- Tenant databases or tenant schemas according to the chosen deployment model
- Database users, passwords, backups, and network access rules

For PostgreSQL mode, configure:

```bash
GYMFLOW_REPOSITORY=postgres
GYMFLOW_CENTRAL_DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/gymflow_central
GYMFLOW_POSTGRES_ADMIN_URL=postgres://ADMIN:PASSWORD@HOST:5432/postgres
GYMFLOW_TENANT_DATABASE_URL_TEMPLATE=postgres://USER:PASSWORD@HOST:5432/{database}
```

Then run:

```bash
npm run backend:seed-postgres
```

The seed script applies central and tenant schema setup and demo data for the current MVP.

## Demo Credentials

Current demo login identities are seeded in the backend store/repository:

- Super Admin: `ops@gymflow.pk`
- Tenant Admin: `admin@fitzone.pk`
- Staff: `staff@fitzone.pk`
- Demo password: `demo`

Change these before sharing a public URL.

## Client Demo Scope

The deployed demo supports:

- Super Admin login
- Tenant registration / provisioning
- Tenant status and plan management
- Subscription billing invoice generation and paid marking
- Tenant Admin login
- Staff login
- Member creation and editing
- Member lifecycle actions
- Payment recording and receipt preview
- Renewals queue and actions
- Notification logs and retry
- Reports and CSV exports
- Tenant settings
- Tenant and platform audit logs

## Production Hardening Still Required

Before real production go-live:

- Replace demo password handling with password hashing and real verification.
- Add JWT/session expiry and refresh-token handling.
- Configure HTTPS, CORS, and secure secrets.
- Use PostgreSQL by default.
- Add backups and restore testing.
- Add background workers for renewals, notifications, stats sync, and provisioning.
- Connect real WhatsApp/SMS/email providers.
- Connect the selected billing/payment gateway.
- Add production observability and alerting.
