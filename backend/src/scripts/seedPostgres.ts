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
        ($1, 'FitZone Karachi', 'fitzone-khi', 'active', $2, 'tenant_fitzone_khi', 'fitzone-khi.gymflow.pk'),
        ($3, 'Iron Temple Lahore', 'irontemple-lhr', 'trial', $4, 'tenant_irontemple_lhr', 'irontemple-lhr.gymflow.pk')
      on conflict (slug) do update
      set name = excluded.name,
          status = excluded.status,
          plan_id = excluded.plan_id,
          database_name = excluded.database_name,
          primary_domain = excluded.primary_domain,
          updated_at = now()
    `,
    [ids.fitzoneTenant, ids.growthPlan, ids.irontempleTenant, ids.professionalPlan],
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
        ('f1000000-0000-4000-8000-000000001101', $1, '2026-07-10', 2, 0, 6200, 5200, 2),
        ('f1000000-0000-4000-8000-000000001102', $2, '2026-07-10', 0, 0, 0, 0, 0)
      on conflict (tenant_id, snapshot_date) do update
      set active_members = excluded.active_members,
          suspended_members = excluded.suspended_members,
          monthly_revenue_pkr = excluded.monthly_revenue_pkr,
          outstanding_dues_pkr = excluded.outstanding_dues_pkr,
          renewal_due_count = excluded.renewal_due_count
    `,
    [ids.fitzoneTenant, ids.irontempleTenant],
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
      insert into members (
        id,
        member_code,
        name,
        phone,
        branch_id,
        plan_id,
        status,
        current_balance_pkr,
        due_date,
        joined_at
      )
      values
        ($1, 'GF-2026-00284', 'Ali Raza', '+92 300 129 8821', $2, $3, 'active', 0, '2026-07-22', '2026-01-12'),
        ($4, 'GF-2026-00285', 'Hira Khan', '+92 321 663 4481', $5, $6, 'balance_due', 1700, '2026-07-13', '2026-02-03'),
        ($7, 'GF-2026-00286', 'Usman Malik', '+92 333 554 1187', $8, $9, 'dues_pending', 3500, '2026-07-10', '2026-03-08')
      on conflict (member_code) do update
      set name = excluded.name,
          phone = excluded.phone,
          branch_id = excluded.branch_id,
          plan_id = excluded.plan_id,
          status = excluded.status,
          current_balance_pkr = excluded.current_balance_pkr,
          due_date = excluded.due_date,
          updated_at = now()
    `,
    [
      ids.aliRaza,
      ids.dhaBranch,
      ids.monthlyProPlan,
      ids.hiraKhan,
      ids.mainBranch,
      ids.monthlyBasicPlan,
      ids.usmanMalik,
      ids.gulbergBranch,
      ids.quarterlyElitePlan,
    ],
  )

  await pool.query(
    `
      insert into payments (
        id,
        member_id,
        collected_by,
        amount_paid_pkr,
        discount_pkr,
        late_fee_pkr,
        method,
        transaction_id,
        payment_type,
        outstanding_after_pkr,
        extends_expiry,
        collected_at
      )
      values
        ($1, $2, $3, 4500, 0, 0, 'easypaisa', 'EP-SEED-001', 'full', 0, true, '2026-07-10T09:15:00+05:00'),
        ($4, $5, $3, 1800, 0, 0, 'cash', null, 'partial', 1700, false, '2026-07-08T16:20:00+05:00')
      on conflict (id) do nothing
    `,
    [ids.aliPayment, ids.aliRaza, ids.fitzoneAdmin, ids.hiraPayment, ids.hiraKhan],
  )

  await pool.query(
    `
      insert into receipts (id, receipt_no, payment_id, member_id, rendered_payload)
      values
        ($1, 'RCP-2026-00144', $2, $3, '{"seeded":true}'::jsonb),
        ($4, 'RCP-2026-00145', $5, $6, '{"seeded":true}'::jsonb)
      on conflict (receipt_no) do nothing
    `,
    [ids.aliReceipt, ids.aliPayment, ids.aliRaza, ids.hiraReceipt, ids.hiraPayment, ids.hiraKhan],
  )

  await pool.query(
    `
      insert into renewal_events (id, member_id, trigger_code, due_date, status)
      values
        ($1, $2, 'due_3_days', '2026-07-22', 'scheduled'),
        ($3, $4, 'due_today', '2026-07-13', 'scheduled'),
        ($5, $6, 'overdue', '2026-07-10', 'overdue')
      on conflict (id) do update
      set trigger_code = excluded.trigger_code,
          due_date = excluded.due_date,
          status = excluded.status,
          updated_at = now()
    `,
    [ids.renewalAli, ids.aliRaza, ids.renewalHira, ids.hiraKhan, ids.renewalUsman, ids.usmanMalik],
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
