import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { centralUsers, defaultBranches, defaultMembershipPlans, subscriptionPlans, tenantStores, tenants } from '../mockStore.js'
import type { AuditLogRecord, BillingInvoiceRecord, SubscriptionPlanRecord, TenantRecord, TenantStore, UserSession } from '../types.js'

export type DevDatabaseState = {
  central: {
    users: UserSession[]
    tenants: TenantRecord[]
    subscriptionPlans: SubscriptionPlanRecord[]
    billingInvoices?: BillingInvoiceRecord[]
    platformAuditLogs?: AuditLogRecord[]
  }
  tenantStores: Record<string, TenantStore>
}

const dataFile = join(process.cwd(), 'backend/data/dev-store.json')

function createInitialState(): DevDatabaseState {
  return {
    central: {
      users: centralUsers,
      tenants,
      subscriptionPlans,
      billingInvoices: [],
      platformAuditLogs: [],
    },
    tenantStores: Object.fromEntries(tenantStores),
  }
}

function ensureStoreFile() {
  if (existsSync(dataFile)) return
  mkdirSync(dirname(dataFile), { recursive: true })
  writeFileSync(dataFile, `${JSON.stringify(createInitialState(), null, 2)}\n`)
}

function withDefaults(state: DevDatabaseState): DevDatabaseState {
  state.central.subscriptionPlans ??= subscriptionPlans
  state.central.billingInvoices ??= []
  state.central.platformAuditLogs ??= []
  for (const tenantStore of Object.values(state.tenantStores)) {
    tenantStore.branches ??= defaultBranches
    tenantStore.membershipPlans ??= defaultMembershipPlans
    tenantStore.notificationLogs ??= []
    tenantStore.auditLogs ??= []
  }
  return state
}

export function readState(): DevDatabaseState {
  ensureStoreFile()
  return withDefaults(JSON.parse(readFileSync(dataFile, 'utf8')) as DevDatabaseState)
}

export function writeState(state: DevDatabaseState) {
  ensureStoreFile()
  writeFileSync(dataFile, `${JSON.stringify(state, null, 2)}\n`)
}

export function resetState() {
  mkdirSync(dirname(dataFile), { recursive: true })
  writeFileSync(dataFile, `${JSON.stringify(createInitialState(), null, 2)}\n`)
}
