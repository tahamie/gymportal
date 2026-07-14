# Tenant Isolation Rules

GymFlow is a tenant-isolated SaaS product. The central platform database and every tenant database have different responsibilities.

## Database Boundary

- Central database stores platform users, tenants, subscription plans, provisioning jobs, central audit logs, and aggregated `tenant_stats`.
- Tenant databases store gym users, members, branches, plans, payments, receipts, renewals, notifications, and tenant audit logs.
- Super Admin APIs must not query tenant member, payment, receipt, or notification rows directly.
- Tenant APIs must never query central platform tables except through authenticated tenant context resolution.

## Request Boundary

- Tenant API requests require `X-Tenant-ID`.
- Tenant API requests resolve exactly one tenant database connection from the authenticated session and tenant header.
- Super Admin platform requests ignore `X-Tenant-ID` and use the central database only.
- A user with role `staff` cannot access tenant settings or platform APIs.
- A user with role `tenant-admin` cannot access platform APIs.
- A user with role `super-admin` cannot access tenant APIs unless a future audited support-impersonation workflow is explicitly designed.

## Stats Sync

Super Admin dashboards use `tenant_stats` snapshots.

Allowed aggregate fields:
- active member count
- suspended member count
- monthly revenue in PKR
- outstanding dues in PKR
- renewal due count

Disallowed central fields:
- member names
- member phone numbers
- payment transaction IDs
- receipt payloads
- notification message bodies

## Provisioning Flow

1. Super Admin creates tenant profile in central database.
2. Provisioning job creates the tenant database from `backend/db/tenant.sql`.
3. Provisioning job seeds first tenant admin, first branch, default plans, and notification templates.
4. Central database stores tenant database name and primary domain.
5. Tenant admin completes invite in the tenant database, not central.

## Audit Rules

- Central actions write to `platform_audit_log`.
- Tenant actions write to `tenant_audit_log`.
- Payment creation, member status changes, notification retries, tenant suspension, plan changes, and provisioning status changes must be audited.
