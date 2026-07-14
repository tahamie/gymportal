-- GymFlow central platform database.
-- Used only by Super Admin APIs and tenant provisioning services.

create table if not exists platform_users (
  id uuid primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('super_admin')),
  mfa_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscription_plans (
  id uuid primary key,
  code text not null unique,
  name text not null,
  monthly_price_pkr integer not null,
  max_branches integer,
  max_members integer,
  whatsapp_enabled boolean not null default true,
  sms_enabled boolean not null default true,
  advanced_reports_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenants (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  status text not null check (status in ('trial', 'active', 'suspended', 'cancelled')),
  plan_id uuid not null references subscription_plans(id),
  database_name text not null unique,
  primary_domain text not null unique,
  timezone text not null default 'Asia/Karachi',
  currency text not null default 'PKR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_admin_invites (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  email text not null,
  invited_by uuid not null references platform_users(id),
  status text not null check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists tenant_stats (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  snapshot_date date not null,
  active_members integer not null default 0,
  suspended_members integer not null default 0,
  monthly_revenue_pkr integer not null default 0,
  outstanding_dues_pkr integer not null default 0,
  renewal_due_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, snapshot_date)
);

create table if not exists billing_invoices (
  id uuid primary key,
  invoice_number text not null unique,
  tenant_id uuid not null references tenants(id),
  plan_name text not null,
  amount_pkr integer not null,
  status text not null check (status in ('issued', 'paid', 'overdue', 'void')),
  period_start date not null,
  period_end date not null,
  due_date date not null,
  paid_at timestamptz,
  provider text not null default 'manual',
  provider_reference text,
  created_at timestamptz not null default now()
);

create table if not exists provisioning_jobs (
  id uuid primary key,
  tenant_id uuid references tenants(id),
  requested_by uuid not null references platform_users(id),
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  step text not null,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists platform_audit_log (
  id uuid primary key,
  actor_user_id uuid not null references platform_users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_tenants_status on tenants(status);
create index if not exists idx_tenant_stats_snapshot on tenant_stats(snapshot_date desc);
create index if not exists idx_billing_invoices_tenant on billing_invoices(tenant_id);
create index if not exists idx_billing_invoices_status on billing_invoices(status, due_date);
create index if not exists idx_platform_audit_created_at on platform_audit_log(created_at desc);
