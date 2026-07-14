-- GymFlow tenant database template.
-- One physical database is provisioned per gym tenant.
-- Tenant member/payment rows never live in the central platform database.

create table if not exists tenant_users (
  id uuid primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('tenant_admin', 'staff')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists branches (
  id uuid primary key,
  name text not null,
  city text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists membership_plans (
  id uuid primary key,
  name text not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'quarterly', 'annual')),
  price_pkr integer not null,
  grace_days integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key,
  member_code text not null unique,
  name text not null,
  phone text not null,
  branch_id uuid not null references branches(id),
  plan_id uuid not null references membership_plans(id),
  status text not null check (status in ('active', 'balance_due', 'dues_pending', 'suspended', 'cancelled')),
  current_balance_pkr integer not null default 0,
  due_date date not null,
  joined_at date not null default current_date,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key,
  member_id uuid not null references members(id),
  collected_by uuid not null references tenant_users(id),
  amount_paid_pkr integer not null,
  discount_pkr integer not null default 0,
  late_fee_pkr integer not null default 0,
  method text not null check (method in ('cash', 'easypaisa', 'jazzcash', 'card', 'bank_transfer')),
  transaction_id text,
  payment_type text not null check (payment_type in ('full', 'partial')),
  outstanding_after_pkr integer not null default 0,
  extends_expiry boolean not null default false,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists receipts (
  id uuid primary key,
  receipt_no text not null unique,
  payment_id uuid not null references payments(id),
  member_id uuid not null references members(id),
  rendered_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists renewal_events (
  id uuid primary key,
  member_id uuid not null references members(id),
  trigger_code text not null,
  due_date date not null,
  status text not null check (status in ('scheduled', 'sent', 'paid', 'overdue', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notification_templates (
  id uuid primary key,
  trigger_code text not null unique,
  purpose text not null,
  whatsapp_enabled boolean not null default true,
  sms_enabled boolean not null default true,
  email_enabled boolean not null default false,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notification_logs (
  id uuid primary key,
  member_id uuid references members(id),
  template_id uuid references notification_templates(id),
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  status text not null check (status in ('queued', 'sent', 'delivered', 'failed')),
  provider_message_id text,
  failure_reason text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists member_channel_preferences (
  id uuid primary key,
  member_id uuid not null references members(id),
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  is_opted_in boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (member_id, channel)
);

create table if not exists tenant_audit_log (
  id uuid primary key,
  actor_user_id uuid references tenant_users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_members_phone on members(phone);
create index if not exists idx_members_status_due_date on members(status, due_date);
create index if not exists idx_payments_collected_at on payments(collected_at desc);
create index if not exists idx_notification_logs_status on notification_logs(status, created_at desc);
create index if not exists idx_tenant_audit_created_at on tenant_audit_log(created_at desc);
