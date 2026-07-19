import { Pool } from 'pg'

function requireEnv(name: string, legacyName?: string) {
  const value = process.env[name] ?? (legacyName ? process.env[legacyName] : undefined)
  if (!value) {
    const names = legacyName ? `${name} or ${legacyName}` : name
    throw new Error(`${names} is required to clean PostgreSQL.`)
  }
  return value
}

function tenantConnectionString(databaseName: string) {
  return requireEnv('GYMFLOW_TENANT_DATABASE_URL_TEMPLATE', 'TENANT_DATABASE_URL_TEMPLATE')
    .replaceAll('{databaseName}', databaseName)
    .replaceAll('{database}', databaseName)
}

async function cleanCentral(pool: Pool) {
  await pool.query(`
    delete from platform_audit_log;
    delete from billing_invoices;
    delete from tenant_stats;
    delete from provisioning_jobs;
    delete from tenant_admin_invites;
    delete from tenants where slug <> 'fitzone-khi';
  `)
}

async function cleanTenant(pool: Pool) {
  await pool.query(`
    delete from tenant_audit_log;
    delete from member_channel_preferences;
    delete from notification_logs;
    delete from renewal_events;
    delete from receipts;
    delete from payments;
    delete from members;
  `)
}

async function main() {
  const centralPool = new Pool({
    connectionString: requireEnv('GYMFLOW_CENTRAL_DATABASE_URL', 'DATABASE_URL'),
  })
  const fitZonePool = new Pool({ connectionString: tenantConnectionString('tenant_fitzone_khi') })

  try {
    await cleanCentral(centralPool)
    await cleanTenant(fitZonePool)
    console.log('Cleaned demo business rows from PostgreSQL. Tenant, users, branches, plans, and templates remain.')
  } finally {
    await fitZonePool.end()
    await centralPool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
