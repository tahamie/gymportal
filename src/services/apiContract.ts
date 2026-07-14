import type { LoginRole, Portal } from './mockGymFlow'

export type ApiSurface = 'auth' | 'tenant' | 'platform'
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type ApiEndpoint = {
  surface: ApiSurface
  method: HttpMethod
  path: string
  portal: Portal | null
  roles: LoginRole[]
  requiresTenantId: boolean
}

export const apiEndpoints = {
  login: {
    surface: 'auth',
    method: 'POST',
    path: '/auth/login',
    portal: null,
    roles: ['tenant-admin', 'staff', 'super-admin'],
    requiresTenantId: false,
  },
  tenantMembers: {
    surface: 'tenant',
    method: 'GET',
    path: '/tenant/members',
    portal: 'tenant',
    roles: ['tenant-admin', 'staff'],
    requiresTenantId: true,
  },
  tenantPayments: {
    surface: 'tenant',
    method: 'POST',
    path: '/tenant/payments',
    portal: 'tenant',
    roles: ['tenant-admin', 'staff'],
    requiresTenantId: true,
  },
  tenantRenewals: {
    surface: 'tenant',
    method: 'GET',
    path: '/tenant/renewals',
    portal: 'tenant',
    roles: ['tenant-admin', 'staff'],
    requiresTenantId: true,
  },
  tenantNotifications: {
    surface: 'tenant',
    method: 'GET',
    path: '/tenant/notifications',
    portal: 'tenant',
    roles: ['tenant-admin', 'staff'],
    requiresTenantId: true,
  },
  tenantReports: {
    surface: 'tenant',
    method: 'GET',
    path: '/tenant/reports/summary',
    portal: 'tenant',
    roles: ['tenant-admin', 'staff'],
    requiresTenantId: true,
  },
  platformTenants: {
    surface: 'platform',
    method: 'GET',
    path: '/platform/tenants',
    portal: 'super-admin',
    roles: ['super-admin'],
    requiresTenantId: false,
  },
  platformPlans: {
    surface: 'platform',
    method: 'GET',
    path: '/platform/plans',
    portal: 'super-admin',
    roles: ['super-admin'],
    requiresTenantId: false,
  },
  platformTenantStats: {
    surface: 'platform',
    method: 'GET',
    path: '/platform/tenant-stats',
    portal: 'super-admin',
    roles: ['super-admin'],
    requiresTenantId: false,
  },
  platformBilling: {
    surface: 'platform',
    method: 'GET',
    path: '/platform/billing',
    portal: 'super-admin',
    roles: ['super-admin'],
    requiresTenantId: false,
  },
  platformBillingInvoice: {
    surface: 'platform',
    method: 'POST',
    path: '/platform/billing/invoices',
    portal: 'super-admin',
    roles: ['super-admin'],
    requiresTenantId: false,
  },
} satisfies Record<string, ApiEndpoint>

export function canCallEndpoint(role: LoginRole, endpoint: ApiEndpoint) {
  return endpoint.roles.includes(role)
}
