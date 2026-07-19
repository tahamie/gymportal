import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pool } from 'pg'

const ids = {
  platformUser: 'f1000000-0000-4000-8000-000000000001',
  growthPlan: 'f1000000-0000-4000-8000-000000000101',
  professionalPlan: 'f1000000-0000-4000-8000-000000000102',
  fitzoneTenant: 'f1000000-0000-4000-8000-000000000201',
  irontempleTenant: 'f1000000-0000-4000-8000-000000000202',
  fitzoneAdmin: 'f1000000-0000-4000-8000-000000000301',
  fitzoneStaff: 'f1000000-0000-4000-8000-000000000302',
  dhaBranch: 'f1000000-0000-4000-8000-000000000401',
  mainBranch: 'f1000000-0000-4000-8000-000000000402',
  gulbergBranch: 'f1000000-0000-4000-8000-000000000403',
  monthlyBasicPlan: 'f1000000-0000-4000-8000-000000000501',
  monthlyProPlan: 'f1000000-0000-4000-8000-000000000502',
  quarterlyElitePlan: 'f1000000-0000-4000-8000-000000000503',
  annualElitePlan: 'f1000000-0000-4000-8000-000000000504',
  aliRaza: 'f1000000-0000-4000-8000-000000000601',
  hiraKhan: 'f1000000-0000-4000-8000-000000000602',
  usmanMalik: 'f1000000-0000-4000-8000-000000000603',
  aliPayment: 'f1000000-0000-4000-8000-000000000701',
  hiraPayment: 'f1000000-0000-4000-8000-000000000702',
  aliReceipt: 'f1000000-0000-4000-8000-000000000801',
  hiraReceipt: 'f1000000-0000-4000-8000-000000000802',
  renewalAli: 'f1000000-0000-4000-8000-000000000901',
  renewalHira: 'f1000000-0000-4000-8000-000000000902',
  renewalUsman: 'f1000000-0000-4000-8000-000000000903',
  templateDueSoon: 'f1000000-0000-4000-8000-000000001001',
  templateOverdue: 'f1000000-0000-4000-8000-000000001002',
}

function requireEnv(name: string, legacyName?: string) {
  const value = process.env[name] ?? (legacyName ? process.env[legacyName] : undefined)
  if (!value) {
    const names = legacyName ? `${name} or ${legacyName}` : name
    throw new Error(`${names} is required to seed PostgreSQL.`)
  }
  return value
}

function tenantConnectionString(databaseName: string) {
  return requireEnv('GYMFLOW_TENANT_DATABASE_URL_TEMPLATE', 'TENANT_DATABASE_URL_TEMPLATE')
    .replaceAll('{databaseName}', databaseName)
    .replaceAll('{database}', databaseName)
}

async function runSchema(pool: Pool, fileName: string) {
  const schema = readFileSync(join(process.cwd(), 'backend/db', fileName), 'utf8')
  await pool.query(schema)
}

async function seedCentral(pool: Pool) {
  await pool.query(
    `
      insert into platform_users (id, name, email, password_hash, role, mfa_required)
      values ($1, 'GymFlow Operations', 'ops@gymflow.pk', 'demo-password-not-for-production', 'super_admin', false)
      on conflict (email) do update
      set name = excluded.name,
          password_hash = excluded.password_hash,
          role = excluded.role,
          mfa_required = excluded.mfa_required,
          updated_at = now()
    `,
    [ids.platformUser],
  )

  await pool.query(
    `
      insert into subscription_plans (
        id,
        code,
        name,
        monthly_price_pkr,
        max_branches,
        max_members,
        advanced_reports_enabled
      )
      values
        ($1, 'growth', 'Growth', 12000, 3, 1000, false),
        ($2, 'professional', 'Professional', 22000, 8, 5000, true)
      on conflict (code) do update
      set name = excluded.name,
          monthly_price_pkr = excluded.monthly_price_pkr,
          max_branches = excluded.max_branches,
          max_members = excluded.max_members,
          advanced_reports_enabled = excluded.advanced_reports_enabled,
          updated_at = now()
    `,
    [ids.growthPlan, ids.professionalPlan],
  )

  await pool.query(
    `
      insert into tenants (
        id,
        name,
        slug,
        status,
        plan_id,
        database_name,
        primary_domain
      )
      values
        ($1, 'FitZone Karachi', 'fitzone-khi', 'active', $2, 'tenant_fitzone_khi', 'fitzone-khi.gymflow.pk')
      on conflict (slug) do update
      set name = excluded.name,
          status = excluded.status,
          plan_id = excluded.plan_id,
          database_name = excluded.database_name,
          primary_domain = excluded.primary_domain,
          updated_at = now()
    `,
    [ids.fitzoneTenant, ids.growthPlan],
  )

  await pool.query(
    `
      insert into tenant_stats (
        id,
        tenant_id,
        snapshot_date,
        active_members,
        suspended_members,
        monthly_revenue_pkr,
        outstanding_dues_pkr,
        renewal_due_count
      )
      values
        ('f1000000-0000-4000-8000-000000001101', $1, current_date, 0, 0, 0, 0, 0)
      on conflict (tenant_id, snapshot_date) do update
      set active_members = excluded.active_members,
          suspended_members = excluded.suspended_members,
          monthly_revenue_pkr = excluded.monthly_revenue_pkr,
          outstanding_dues_pkr = excluded.outstanding_dues_pkr,
          renewal_due_count = excluded.renewal_due_count
    `,
    [ids.fitzoneTenant],
  )
}

async function seedFitZoneTenant(pool: Pool) {
  await pool.query(
    `
      insert into tenant_users (id, name, email, password_hash, role)
      values
        ($1, 'Ayesha Siddiqui', 'admin@fitzone.pk', 'demo-password-not-for-production', 'tenant_admin'),
        ($2, 'Sana Javed', 'staff@fitzone.pk', 'demo-password-not-for-production', 'staff')
      on conflict (email) do update
      set name = excluded.name,
          password_hash = excluded.password_hash,
          role = excluded.role,
          is_active = true,
          updated_at = now()
    `,
    [ids.fitzoneAdmin, ids.fitzoneStaff],
  )

  await pool.query(
    `
      insert into branches (id, name, city, address)
      values
        ($1, 'DHA Branch', 'Karachi', 'DHA Karachi'),
        ($2, 'Main Branch', 'Karachi', 'Main Boulevard Karachi'),
        ($3, 'Gulberg', 'Karachi', 'Gulberg Karachi')
      on conflict (id) do update
      set name = excluded.name,
          city = excluded.city,
          address = excluded.address,
          updated_at = now()
    `,
    [ids.dhaBranch, ids.mainBranch, ids.gulbergBranch],
  )

  await pool.query(
    `
      insert into membership_plans (id, name, billing_cycle, price_pkr, grace_days)
      values
        ($1, 'Monthly Basic', 'monthly', 3500, 3),
        ($2, 'Monthly Pro', 'monthly', 4500, 3),
        ($3, 'Quarterly Elite', 'quarterly', 9000, 5),
        ($4, 'Annual Elite', 'annual', 12000, 7)
      on conflict (id) do update
      set name = excluded.name,
          billing_cycle = excluded.billing_cycle,
          price_pkr = excluded.price_pkr,
          grace_days = excluded.grace_days,
          updated_at = now()
    `,
    [ids.monthlyBasicPlan, ids.monthlyProPlan, ids.quarterlyElitePlan, ids.annualElitePlan],
  )

  await pool.query(
    `
      insert into notification_templates (id, trigger_code, purpose, body)
      values
        ($1, 'due_3_days', 'Renewal reminder', 'Hi {{memberName}}, your GymFlow membership is due on {{dueDate}}.'),
        ($2, 'overdue', 'Overdue reminder', 'Hi {{memberName}}, your membership payment is overdue. Please clear PKR {{balance}}.')
      on conflict (trigger_code) do update
      set purpose = excluded.purpose,
          body = excluded.body,
          is_active = true,
          updated_at = now()
    `,
    [ids.templateDueSoon, ids.templateOverdue],
  )
}

async function main() {
  const centralPool = new Pool({
    connectionString: requireEnv('GYMFLOW_CENTRAL_DATABASE_URL', 'DATABASE_URL'),
  })
  const fitZonePool = new Pool({ connectionString: tenantConnectionString('tenant_fitzone_khi') })

  try {
    await runSchema(centralPool, 'central.sql')
    await seedCentral(centralPool)
    await runSchema(fitZonePool, 'tenant.sql')
    await seedFitZoneTenant(fitZonePool)
    console.log('Seeded central platform database and FitZone tenant database.')
  } finally {
    await fitZonePool.end()
    await centralPool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
