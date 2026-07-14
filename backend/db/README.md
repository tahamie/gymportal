# GymFlow Database Handoff

GymFlow uses PostgreSQL in deployment mode.

Do not push a live database file to GitHub. The repository contains the reproducible database assets DevOps needs:

- `backend/db/central.sql` for Super Admin/platform tables
- `backend/db/tenant.sql` for each tenant gym database
- `backend/db/init-local.sql` for local Docker bootstrap only
- `backend/src/scripts/seedPostgres.ts` for demo/UAT seed data

## Local PostgreSQL Smoke Setup

```bash
docker compose -f docker-compose.postgres.yml up -d
cp .env.example .env
npm install
npm run backend:seed-postgres
GYMFLOW_REPOSITORY=postgres npm run backend:start
```

The local bootstrap creates:

- `gymflow_central`
- `tenant_fitzone_khi`
- `tenant_irontemple_lhr`

## Production / UAT Setup

DevOps should provision PostgreSQL separately, then configure:

```bash
GYMFLOW_REPOSITORY=postgres
GYMFLOW_CENTRAL_DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/gymflow_central
GYMFLOW_POSTGRES_ADMIN_URL=postgres://ADMIN:PASSWORD@HOST:5432/postgres
GYMFLOW_TENANT_DATABASE_URL_TEMPLATE=postgres://USER:PASSWORD@HOST:5432/{database}
```

Run the seed only for demo/UAT:

```bash
npm run backend:seed-postgres
```

For production, apply `central.sql` to the central DB and `tenant.sql` to every tenant DB, then create real users/passwords through the application flow or an approved provisioning script.

## Demo Credentials From Seed

- Super Admin: `ops@gymflow.pk`
- Tenant Admin: `admin@fitzone.pk`
- Staff: `staff@fitzone.pk`
- Demo password: `demo`

Replace these before public access.
