# GymFlow

GymFlow is a tenant-based gym management prototype with separate Tenant and Super Admin portals.

## Run Locally

```bash
npm install
npm run backend:build
npm run backend:start
npm run build
npm run preview -- --host 127.0.0.1
```

Frontend: http://127.0.0.1:4173  
Backend: http://127.0.0.1:4100/health

## Data Source

The app now defaults to **Local API** mode. Use this for normal testing because members, payments, renewals, tenants, settings, and platform controls persist through the backend file store.

The login screen still includes **Demo mock** as a deliberate fallback. Mock mode stores tenant members in browser storage only and should not be used for primary workflow testing.

## Demo Login

Tenant Admin:
- URL: `fitzone-khi.gymflow.pk`
- Email: `admin@fitzone.pk`
- Password: `demo`

Staff:
- URL: `fitzone-khi.gymflow.pk`
- Email: `staff@fitzone.pk`
- Password: `demo`

Super Admin:
- URL: `app.gymflow.pk`
- Email: `ops@gymflow.pk`
- Password: `demo`

## Verification

```bash
npm run backend:typecheck
npm run backend:build
npm run backend:test
npm run typecheck
npm run lint
npm run build
```
