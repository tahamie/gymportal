import { Pool, type PoolClient } from 'pg'
import type { TenantRecord } from '../types.js'

const tenantPools = new Map<string, Pool>()
let centralPool: Pool | null = null
let adminPool: Pool | null = null

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required when GYMFLOW_REPOSITORY=postgres.`)
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
  centralPool ??= createPool(requireEnv('DATABASE_URL'))
  return centralPool
}

export function getAdminPool() {
  adminPool ??= createPool(process.env.POSTGRES_ADMIN_DATABASE_URL ?? requireEnv('DATABASE_URL'))
  return adminPool
}

export function getTenantConnectionString(databaseName: string) {
  const template = requireEnv('TENANT_DATABASE_URL_TEMPLATE')
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
