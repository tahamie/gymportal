import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { handleRequest } from '../app.js'
import { resetState } from '../repositories/fileStore.js'

type ApiResponse<T> = {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

type LoginPayload = {
  accessToken: string
  user: {
    role: string
    tenantId?: string
  }
}

type MemberPayload = {
  members: Array<{
    id: string
    status: string
    currentBalancePkr: number
  }>
}

type PaymentsPayload = {
  payments: Array<{
    memberId: string
    amountPaidPkr: number
    outstandingAfterPkr: number
  }>
}

type PlatformTenantsPayload = {
  tenants: Array<{
    id: string
    slug: string
    status: string
  }>
}

type ProvisionTenantPayload = {
  tenant: {
    id: string
    slug: string
    databaseName: string
  }
  job: {
    status: string
    step: string
  }
}

let server: Server
let baseUrl = ''

function isAddressInfo(address: string | AddressInfo | null): address is AddressInfo {
  return typeof address === 'object' && address !== null && 'port' in address
}

async function startServer() {
  server = createServer((req, res) => {
    handleRequest(req, res).catch((error: unknown) => {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: { code: 'TEST_ERROR', message: String(error) } }))
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!isAddressInfo(address)) {
    throw new Error('Test server did not bind to a TCP port.')
  }
  baseUrl = `http://127.0.0.1:${address.port}`
}

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const payload = await response.json() as ApiResponse<T>
  return { response, payload }
}

async function loginTenant() {
  const { payload } = await request<LoginPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@fitzone.pk',
      password: 'demo',
      portal: 'tenant',
      tenantSlug: 'fitzone-khi',
    }),
  })

  assert.equal(payload.ok, true)
  assert.ok(payload.data?.accessToken)
  assert.equal(payload.data.user.tenantId, 'tenant_fitzone_khi')
  return payload.data.accessToken
}

async function loginSuperAdmin() {
  const { payload } = await request<LoginPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'ops@gymflow.pk',
      password: 'demo',
      portal: 'super-admin',
    }),
  })

  assert.equal(payload.ok, true)
  assert.ok(payload.data?.accessToken)
  assert.equal(payload.data.user.role, 'super-admin')
  return payload.data.accessToken
}

async function loginStaff() {
  const { payload } = await request<LoginPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'staff@fitzone.pk',
      password: 'demo',
      portal: 'tenant',
      tenantSlug: 'fitzone-khi',
    }),
  })

  assert.equal(payload.ok, true)
  assert.ok(payload.data?.accessToken)
  assert.equal(payload.data.user.tenantId, 'tenant_fitzone_khi')
  return payload.data.accessToken
}

beforeEach(async () => {
  resetState()
  if (!baseUrl) await startServer()
})

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
    server.closeAllConnections()
  })
  resetState()
})

test('health endpoint reports service status', async () => {
  const { response, payload } = await request<{ status: string; service: string }>('/health')

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.data?.service, 'gymflow-api')
})

test('tenant login requires the matching tenant slug', async () => {
  const { response, payload } = await request<LoginPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@fitzone.pk',
      password: 'demo',
      portal: 'tenant',
      tenantSlug: 'irontemple-lhr',
    }),
  })

  assert.equal(response.status, 403)
  assert.equal(payload.ok, false)
  assert.equal(payload.error?.code, 'TENANT_ACCESS_DENIED')
})

test('tenant users can list members only for their own tenant', async () => {
  const token = await loginTenant()

  const allowed = await request<MemberPayload>('/tenant/members', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })
  assert.equal(allowed.response.status, 200)
  assert.equal(allowed.payload.ok, true)
  assert.equal(allowed.payload.data?.members.length, 3)

  const denied = await request<MemberPayload>('/tenant/members', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_irontemple_lhr',
    },
  })
  assert.equal(denied.response.status, 403)
  assert.equal(denied.payload.error?.code, 'TENANT_MISMATCH')
})

test('tenant users can create a member in their own tenant', async () => {
  const token = await loginTenant()

  const created = await request<MemberPayload & { member?: { name: string; currentBalancePkr: number } }>('/tenant/members', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      name: 'Ayesha Noor',
      phone: '+92 300 000 0000',
      branchName: 'Main Branch',
      planName: 'Monthly Pro',
    }),
  })

  assert.equal(created.response.status, 201)
  assert.equal(created.payload.ok, true)
  assert.equal(created.payload.data?.member?.name, 'Ayesha Noor')
  assert.equal(created.payload.data?.member?.currentBalancePkr, 4500)

  const members = await request<MemberPayload>('/tenant/members', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })
  assert.equal(members.payload.data?.members.length, 4)
})

test('tenant users can update a member profile in their own tenant', async () => {
  const token = await loginTenant()

  const updated = await request<{ member: { id: string; name: string; phone: string; status: string; dueDate: string } }>('/tenant/members/mem_hira_khan', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      name: 'Hira Khan Updated',
      phone: '+92 321 000 1111',
      status: 'active',
      dueDate: '2026-07-25',
    }),
  })

  assert.equal(updated.response.status, 200)
  assert.equal(updated.payload.ok, true)
  assert.equal(updated.payload.data?.member.name, 'Hira Khan Updated')
  assert.equal(updated.payload.data?.member.phone, '+92 321 000 1111')
  assert.equal(updated.payload.data?.member.status, 'active')
  assert.equal(updated.payload.data?.member.dueDate, '2026-07-25')
})

test('tenant admins can suspend cancel and reactivate a member through the lifecycle patch', async () => {
  const token = await loginTenant()

  const suspended = await request<{ member: { status: string } }>('/tenant/members/mem_hira_khan', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({ status: 'suspended' }),
  })
  assert.equal(suspended.response.status, 200)
  assert.equal(suspended.payload.data?.member.status, 'suspended')

  const cancelled = await request<{ member: { status: string } }>('/tenant/members/mem_hira_khan', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({ status: 'cancelled' }),
  })
  assert.equal(cancelled.response.status, 200)
  assert.equal(cancelled.payload.data?.member.status, 'cancelled')

  const reactivated = await request<{ member: { status: string } }>('/tenant/members/mem_hira_khan', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({ status: 'active' }),
  })
  assert.equal(reactivated.response.status, 200)
  assert.equal(reactivated.payload.data?.member.status, 'active')
})

test('tenant users can queue a member reminder', async () => {
  const token = await loginTenant()

  const queued = await request<{ notification: { memberId: string; triggerCode: string; channel: string; status: string } }>('/tenant/notifications/reminders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      memberId: 'mem_hira_khan',
      triggerCode: 'due_3_days',
      channel: 'whatsapp',
    }),
  })

  assert.equal(queued.response.status, 201)
  assert.equal(queued.payload.ok, true)
  assert.equal(queued.payload.data?.notification.memberId, 'mem_hira_khan')
  assert.equal(queued.payload.data?.notification.triggerCode, 'due_3_days')
  assert.equal(queued.payload.data?.notification.channel, 'whatsapp')
  assert.equal(queued.payload.data?.notification.status, 'queued')
})

test('tenant users can list renewals and update a renewal action', async () => {
  const token = await loginTenant()

  const renewals = await request<{ renewals: Array<{ memberId: string; renewalStatus: string }> }>('/tenant/renewals', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })
  assert.equal(renewals.response.status, 200)
  assert.equal(renewals.payload.data?.renewals.some((renewal) => renewal.memberId === 'mem_hira_khan'), true)

  const updated = await request<{ renewal: { memberId: string; renewalStatus: string }; notification: unknown }>('/tenant/renewals/mem_hira_khan', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({ action: 'reminder_queued', channel: 'whatsapp' }),
  })
  assert.equal(updated.response.status, 200)
  assert.equal(updated.payload.data?.renewal.memberId, 'mem_hira_khan')
  assert.equal(updated.payload.data?.renewal.renewalStatus, 'reminder_queued')
  assert.ok(updated.payload.data?.notification)
})

test('tenant users can list and retry notification logs', async () => {
  const token = await loginTenant()

  const queued = await request<{ notification: { id: string } }>('/tenant/notifications/reminders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      memberId: 'mem_hira_khan',
      triggerCode: 'due_3_days',
      channel: 'whatsapp',
    }),
  })
  assert.equal(queued.response.status, 201)
  const notificationId = queued.payload.data?.notification.id
  assert.ok(notificationId)

  const logs = await request<{ notifications: Array<{ id: string; memberName: string }> }>('/tenant/notifications', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })
  assert.equal(logs.response.status, 200)
  assert.equal(logs.payload.data?.notifications[0]?.memberName, 'Hira Khan')

  const retried = await request<{ notification: { status: string } }>(`/tenant/notifications/${notificationId}/retry`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })
  assert.equal(retried.response.status, 201)
  assert.equal(retried.payload.data?.notification.status, 'queued')
})

test('super admin cannot call tenant member APIs', async () => {
  const token = await loginSuperAdmin()

  const { response, payload } = await request<MemberPayload>('/tenant/members', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })

  assert.equal(response.status, 403)
  assert.equal(payload.ok, false)
  assert.equal(payload.error?.code, 'FORBIDDEN')
})

test('payment creation persists and updates member balance', async () => {
  const token = await loginTenant()

  const createPayment = await request('/tenant/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      memberId: 'mem_hira_khan',
      amountPaidPkr: 1700,
      method: 'easypaisa',
      transactionId: 'EP-883921',
    }),
  })
  assert.equal(createPayment.response.status, 201)
  assert.equal(createPayment.payload.ok, true)

  const payments = await request<PaymentsPayload>('/tenant/payments', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })
  assert.equal(payments.payload.data?.payments.length, 1)
  assert.equal(payments.payload.data?.payments[0]?.outstandingAfterPkr, 0)

  const members = await request<MemberPayload>('/tenant/members', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })
  const hira = members.payload.data?.members.find((member) => member.id === 'mem_hira_khan')
  assert.equal(hira?.status, 'active')
  assert.equal(hira?.currentBalancePkr, 0)
})

test('digital payment requires transaction id', async () => {
  const token = await loginTenant()

  const { response, payload } = await request('/tenant/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      memberId: 'mem_hira_khan',
      amountPaidPkr: 1700,
      method: 'easypaisa',
    }),
  })

  assert.equal(response.status, 400)
  assert.equal(payload.ok, false)
  assert.equal(payload.error?.code, 'TRANSACTION_ID_REQUIRED')
})

test('tenant admins can manage tenant settings and staff cannot mutate them', async () => {
  const adminToken = await loginTenant()
  const staffToken = await loginStaff()

  const settings = await request<{ branches: unknown[]; membershipPlans: unknown[]; staffAccess: unknown[] }>('/tenant/settings', {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })
  assert.equal(settings.response.status, 200)
  assert.equal(settings.payload.ok, true)
  assert.ok(settings.payload.data?.branches.length)
  assert.ok(settings.payload.data?.membershipPlans.length)

  const branch = await request<{ branch: { name: string; city: string } }>('/tenant/settings/branches', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      name: 'North Nazimabad',
      city: 'Karachi',
    }),
  })
  assert.equal(branch.response.status, 201)
  assert.equal(branch.payload.data?.branch.name, 'North Nazimabad')

  const plan = await request<{ plan: { name: string; pricePkr: number } }>('/tenant/settings/membership-plans', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      name: 'Monthly Plus',
      billingCycle: 'monthly',
      pricePkr: 5000,
      graceDays: 3,
    }),
  })
  assert.equal(plan.response.status, 201)
  assert.equal(plan.payload.data?.plan.pricePkr, 5000)

  const denied = await request('/tenant/settings/branches', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      name: 'Staff Branch',
      city: 'Karachi',
    }),
  })
  assert.equal(denied.response.status, 403)
  assert.equal(denied.payload.error?.code, 'FORBIDDEN')
})

test('tenant report summary returns aggregate-only operational metrics', async () => {
  const token = await loginTenant()

  await request('/tenant/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      memberId: 'mem_hira_khan',
      amountPaidPkr: 1700,
      method: 'cash',
    }),
  })

  const report = await request<{ collectionsPkr: number; outstandingDuesPkr: number; renewalDueCount: number }>('/tenant/reports/summary', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })
  assert.equal(report.response.status, 200)
  assert.equal(report.payload.data?.collectionsPkr, 1700)
  assert.ok((report.payload.data?.renewalDueCount ?? 0) > 0)
})

test('tenant audit log records member and payment actions', async () => {
  const token = await loginTenant()

  await request('/tenant/members', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      name: 'Audit Member',
      phone: '+92 300 222 3333',
      branchName: 'Main Branch',
      planName: 'Monthly Basic',
    }),
  })

  await request('/tenant/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
    body: JSON.stringify({
      memberId: 'mem_hira_khan',
      amountPaidPkr: 1700,
      method: 'cash',
    }),
  })

  const audit = await request<{ auditLogs: Array<{ action: string; scope: string; actorName: string }> }>('/tenant/audit-log', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': 'tenant_fitzone_khi',
    },
  })

  assert.equal(audit.response.status, 200)
  assert.equal(audit.payload.ok, true)
  assert.equal(audit.payload.data?.auditLogs.some((log) => log.action === 'member.created'), true)
  assert.equal(audit.payload.data?.auditLogs.some((log) => log.action === 'payment.created'), true)
  assert.equal(audit.payload.data?.auditLogs[0]?.scope, 'tenant')
  assert.equal(audit.payload.data?.auditLogs[0]?.actorName, 'Ayesha Siddiqui')
})

test('super admin can list platform tenants', async () => {
  const token = await loginSuperAdmin()

  const { response, payload } = await request<PlatformTenantsPayload>('/platform/tenants', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.data?.tenants[0]?.slug, 'fitzone-khi')
})

test('super admin can update tenant status', async () => {
  const token = await loginSuperAdmin()

  const updated = await request<{ tenant: { id: string; status: string } }>('/platform/tenants/tenant_irontemple_lhr/status', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      status: 'suspended',
    }),
  })

  assert.equal(updated.response.status, 200)
  assert.equal(updated.payload.ok, true)
  assert.equal(updated.payload.data?.tenant.status, 'suspended')

  const tenants = await request<PlatformTenantsPayload>('/platform/tenants', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  const ironTemple = tenants.payload.data?.tenants.find((tenant) => tenant.id === 'tenant_irontemple_lhr')
  assert.equal(ironTemple?.slug, 'irontemple-lhr')
  assert.equal(ironTemple?.status, 'suspended')
})

test('super admin can manage platform plans and assign a tenant plan', async () => {
  const token = await loginSuperAdmin()

  const plans = await request<{ plans: Array<{ code: string; name: string }> }>('/platform/plans', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  assert.equal(plans.response.status, 200)
  assert.equal(plans.payload.data?.plans.some((plan) => plan.code === 'growth'), true)

  const customPlan = await request<{ plan: { code: string; monthlyPricePkr: number } }>('/platform/plans', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      code: 'enterprise',
      name: 'Enterprise',
      monthlyPricePkr: 65000,
      maxBranches: null,
      maxMembers: null,
      whatsappEnabled: true,
      smsEnabled: true,
      advancedReportsEnabled: true,
      isActive: true,
    }),
  })
  assert.equal(customPlan.response.status, 201)
  assert.equal(customPlan.payload.data?.plan.code, 'enterprise')

  const updatedTenant = await request<{ tenant: { id: string; plan: string } }>('/platform/tenants/tenant_fitzone_khi/plan', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ planCode: 'enterprise' }),
  })
  assert.equal(updatedTenant.response.status, 200)
  assert.equal(updatedTenant.payload.data?.tenant.plan, 'Enterprise')
})

test('super admin can generate and mark subscription invoices paid', async () => {
  const token = await loginSuperAdmin()

  const initialBilling = await request<{
    summary: { openInvoiceCount: number; issuedPkr: number }
    invoices: Array<{ id: string; invoiceNumber: string; status: string }>
  }>('/platform/billing', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  assert.equal(initialBilling.response.status, 200)
  assert.equal(initialBilling.payload.data?.summary.openInvoiceCount, 0)

  const created = await request<{ invoice: { id: string; invoiceNumber: string; tenantId: string; amountPkr: number; status: string } }>('/platform/billing/invoices', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tenantId: 'tenant_fitzone_khi' }),
  })
  assert.equal(created.response.status, 201)
  assert.equal(created.payload.data?.invoice.tenantId, 'tenant_fitzone_khi')
  assert.equal(created.payload.data?.invoice.status, 'issued')
  assert.ok(created.payload.data?.invoice.amountPkr)

  const paid = await request<{ invoice: { id: string; status: string; providerReference: string | null } }>(`/platform/billing/invoices/${created.payload.data?.invoice.id}/paid`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  assert.equal(paid.response.status, 200)
  assert.equal(paid.payload.data?.invoice.status, 'paid')
  assert.ok(paid.payload.data?.invoice.providerReference)

  const billing = await request<{
    summary: { paidPkr: number; openInvoiceCount: number }
    invoices: Array<{ invoiceNumber: string; status: string }>
  }>('/platform/billing', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  assert.equal(billing.payload.data?.summary.openInvoiceCount, 0)
  assert.equal(billing.payload.data?.invoices[0]?.status, 'paid')
})

test('super admin can read platform audit log for central actions', async () => {
  const token = await loginSuperAdmin()

  await request('/platform/tenants/tenant_irontemple_lhr/status', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      status: 'suspended',
    }),
  })

  const audit = await request<{ auditLogs: Array<{ action: string; scope: string; actorName: string }> }>('/platform/audit-log', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  assert.equal(audit.response.status, 200)
  assert.equal(audit.payload.ok, true)
  assert.equal(audit.payload.data?.auditLogs.some((log) => log.action === 'tenant.status_updated'), true)
  assert.equal(audit.payload.data?.auditLogs[0]?.scope, 'platform')
  assert.equal(audit.payload.data?.auditLogs[0]?.actorName, 'GymFlow Operations')
})

test('super admin can read aggregate tenant stats without tenant member rows', async () => {
  const token = await loginSuperAdmin()

  const stats = await request<{ stats: Array<{ tenantId: string; activeMembers: number; outstandingDuesPkr: number }> }>('/platform/tenant-stats', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  assert.equal(stats.response.status, 200)
  assert.equal(stats.payload.ok, true)
  assert.equal(stats.payload.data?.stats.some((tenantStats) => tenantStats.tenantId === 'tenant_fitzone_khi'), true)
  assert.equal('members' in (stats.payload.data?.stats[0] ?? {}), false)
})

test('super admin can provision a tenant from the platform API', async () => {
  const token = await loginSuperAdmin()

  const provisioned = await request<ProvisionTenantPayload>('/platform/tenants', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Pulse Gym Islamabad',
      slug: 'pulse-isb',
      planCode: 'growth',
      adminName: 'Maham Khan',
      adminEmail: 'admin@pulse.pk',
      city: 'Islamabad',
      branchName: 'F-8 Branch',
    }),
  })

  assert.equal(provisioned.response.status, 201)
  assert.equal(provisioned.payload.ok, true)
  assert.equal(provisioned.payload.data?.tenant.slug, 'pulse-isb')
  assert.equal(provisioned.payload.data?.tenant.databaseName, 'tenant_pulse_isb')
  assert.equal(provisioned.payload.data?.job.status, 'completed')

  const tenants = await request<PlatformTenantsPayload>('/platform/tenants', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  assert.equal(tenants.payload.data?.tenants.some((tenant) => tenant.slug === 'pulse-isb'), true)

  const duplicate = await request<ProvisionTenantPayload>('/platform/tenants', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Pulse Gym Islamabad',
      slug: 'pulse-isb',
      adminName: 'Maham Khan',
      adminEmail: 'admin@pulse.pk',
    }),
  })
  assert.equal(duplicate.response.status, 409)
  assert.equal(duplicate.payload.ok, false)
})
