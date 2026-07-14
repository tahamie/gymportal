import { Pool, type PoolClient } from 'pg'
import type { TenantRecord } from '../types.js'

const tenantPools = new Map<string, Pool>()
let centralPool: Pool | null = null
let adminPool: Pool | null = null

function requireEnv(name: string, legacyName?: string) {
  const value = process.env[name] ?? (legacyName ? process.env[legacyName] : undefined)
  if (!value) {
    const names = legacyName ? `${name} or ${legacyName}` : name
    throw new Error(`${names} is required when GYMFLOW_REPOSITORY=postgres.`)
  }
  return value
}

function createPool(connectionString: string) {
  return new Pool({
    connectionString,
    max: Number(process.env.POSTGRES_POOL_MAX ?? 10),
  })
}

export function getCentralPool() {
  centralPool ??= createPool(requireEnv('GYMFLOW_CENTRAL_DATABASE_URL', 'DATABASE_URL'))
  return centralPool
}

export function getAdminPool() {
  adminPool ??= createPool(
    process.env.GYMFLOW_POSTGRES_ADMIN_URL ??
      process.env.POSTGRES_ADMIN_DATABASE_URL ??
      requireEnv('GYMFLOW_CENTRAL_DATABASE_URL', 'DATABASE_URL'),
  )
  return adminPool
}

export function getTenantConnectionString(databaseName: string) {
  const template = requireEnv('GYMFLOW_TENANT_DATABASE_URL_TEMPLATE', 'TENANT_DATABASE_URL_TEMPLATE')
  return template
    .replaceAll('{databaseName}', databaseName)
    .replaceAll('{database}', databaseName)
}

export function getTenantPool(tenant: TenantRecord) {
  const existingPool = tenantPools.get(tenant.id)
  if (existingPool) return existingPool

  const pool = createPool(getTenantConnectionString(tenant.databaseName))
  tenantPools.set(tenant.id, pool)
  return pool
}

export async function withTenantTransaction<T>(
  tenant: TenantRecord,
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getTenantPool(tenant).connect()
  try {
    await client.query('begin')
    const result = await callback(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
