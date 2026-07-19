import {
  mockGymFlowApi,
  type AuditLog,
  type AuthSession,
  type CreateMemberInput,
  type Member,
  type MemberStatus,
  type NotificationLog,
  type PaymentMethod,
  type PlatformBillingInvoice,
  type PlatformBillingSummary,
  type PlatformPlan,
  type PlatformTenant,
  type PlatformTenantStats,
  type PlatformTenantStatus,
  type Portal,
  type ProvisionTenantInput,
  type RenewalQueueItem,
  type TenantReportSummary,
  type TenantSettings,
  type UpdateMemberInput,
} from './mockGymFlow'

export type ApiMode = 'mock' | 'backend'

type ApiResponse<T> = {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

type BackendUser = {
  id: string
  name: string
  email: string
  role: 'tenant-admin' | 'staff' | 'super-admin'
  portal: Portal
  tenantId?: string
}

type BackendMember = {
  id: string
  memberCode: string
  name: string
  phone: string
  branchName: string
  planName: string
  status: 'active' | 'balance_due' | 'dues_pending' | 'suspended' | 'cancelled'
  currentBalancePkr: number
  dueDate: string
  lastPaymentDate: string
}

type BackendTenant = {
  id: string
  name: string
  slug: string
  status: 'trial' | 'active' | 'suspended' | 'cancelled'
  plan: string
  databaseName?: string
  primaryDomain?: string
}

type CreatePaymentRequest = {
  member: Member
  amountPaidPkr: number
  discountPkr: number
  lateFeePkr: number
  method: PaymentMethod
  transactionId?: string
}

type CreateMemberResponse = {
  member: BackendMember
}

type UpdateMemberResponse = {
  member: BackendMember
}

type SendReminderResponse = {
  notification: {
    id: string
    memberId: string
    triggerCode: string
    channel: 'whatsapp' | 'sms' | 'email'
    status: string
  }
}

type ProvisionTenantResponse = {
  tenant: BackendTenant
  job: {
    status: string
    step: string
  }
}

const apiModeKey = 'gymflow-api-mode'
const mockMembersKeyPrefix = 'gymflow-mock-members'
const mockBillingInvoicesKey = 'gymflow-mock-billing-invoices'
const apiBaseUrl = import.meta.env.VITE_GYMFLOW_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:4100' : '/api')

function isMockModeAllowed() {
  return import.meta.env.DEV || import.meta.env.VITE_GYMFLOW_ALLOW_MOCK === 'true'
}

export function getStoredApiMode(): ApiMode {
  const storedMode = window.localStorage.getItem(apiModeKey)
  if (storedMode === 'mock' && isMockModeAllowed()) return storedMode
  if (storedMode === 'backend') return storedMode
  if (!isMockModeAllowed()) return 'backend'
  return import.meta.env.VITE_GYMFLOW_API_MODE === 'mock' ? 'mock' : 'backend'
}

export function storeApiMode(mode: ApiMode) {
  if (mode === 'mock' && !isMockModeAllowed()) return
  window.localStorage.setItem(apiModeKey, mode)
}

export function getApiBaseUrl() {
  return apiBaseUrl
}

function toDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toTitleStatus(status: BackendMember['status']): Member['status'] {
  if (status === 'balance_due') return 'Balance Due'
  if (status === 'dues_pending') return 'Dues Pending'
  if (status === 'suspended') return 'Suspended'
  if (status === 'cancelled') return 'Cancelled'
  return 'Active'
}

function toBackendStatus(status: MemberStatus): BackendMember['status'] {
  if (status === 'Balance Due') return 'balance_due'
  if (status === 'Dues Pending') return 'dues_pending'
  if (status === 'Suspended') return 'suspended'
  if (status === 'Cancelled') return 'cancelled'
  return 'active'
}

function toIsoDate(value: string | undefined) {
  if (!value) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString().slice(0, 10)
}

function mapBackendMember(member: BackendMember): Member {
  return {
    id: member.memberCode,
    sourceId: member.id,
    name: member.name,
    phone: member.phone,
    branch: member.branchName,
    plan: member.planName,
    dueDate: toDateLabel(member.dueDate),
    balance: member.currentBalancePkr,
    status: toTitleStatus(member.status),
    lastPayment: toDateLabel(member.lastPaymentDate),
  }
}

function tenantStatusLabel(status: BackendTenant['status']) {
  if (status === 'trial') return 'Trial'
  if (status === 'suspended') return 'Suspended'
  if (status === 'cancelled') return 'Cancelled'
  return 'Active'
}

function tenantStatusToBackend(status: PlatformTenantStatus): BackendTenant['status'] {
  if (status === 'Trial') return 'trial'
  if (status === 'Suspended') return 'suspended'
  if (status === 'Cancelled') return 'cancelled'
  return 'active'
}

function planNameForCode(planCode: string) {
  if (planCode === 'professional') return 'Professional'
  if (planCode === 'starter') return 'Starter'
  return 'Growth'
}

function mapBackendTenant(tenant: BackendTenant): PlatformTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    status: tenantStatusLabel(tenant.status),
    members: 0,
    revenue: 0,
    databaseName: tenant.databaseName ?? `tenant_${tenant.slug.replaceAll('-', '_')}`,
    primaryDomain: tenant.primaryDomain ?? `${tenant.slug}.gymflow.pk`,
    provisioningStatus: 'completed',
  }
}

function statusLabelFromBackend(status: BackendMember['status']): MemberStatus {
  return toTitleStatus(status)
}

function mockMembersKey(session?: AuthSession) {
  return `${mockMembersKeyPrefix}:${session?.tenantId ?? session?.tenantSlug ?? 'default'}`
}

function readMockMembers(session?: AuthSession): Member[] {
  const storedMembers = window.localStorage.getItem(mockMembersKey(session))
  if (!storedMembers) return mockGymFlowApi.tenant.getMembers()

  try {
    const parsedMembers = JSON.parse(storedMembers) as Member[]
    return Array.isArray(parsedMembers) ? parsedMembers : mockGymFlowApi.tenant.getMembers()
  } catch {
    return mockGymFlowApi.tenant.getMembers()
  }
}

function writeMockMembers(session: AuthSession | undefined, members: Member[]) {
  window.localStorage.setItem(mockMembersKey(session), JSON.stringify(members))
}

function mockPlanPrice(planName: string) {
  if (planName.includes('Annual')) return 12000
  if (planName.includes('Quarterly')) return 9000
  if (planName.includes('Pro')) return 4500
  return 3500
}

function nextMockMemberCode(members: Member[]) {
  const numbers = members
    .map((member) => Number(member.id.match(/(\d+)$/)?.[1] ?? 0))
    .filter((value) => Number.isFinite(value))
  return `GF-2026-${String(Math.max(288, ...numbers) + 1).padStart(5, '0')}`
}

function mockRenewalsFromMembers(members: Member[]): RenewalQueueItem[] {
  return members
    .filter((member) => member.status !== 'Cancelled')
    .map((member) => ({
      memberId: member.sourceId ?? member.id,
      memberName: member.name,
      memberCode: member.id,
      planName: member.plan,
      branchName: member.branch,
      dueDate: member.dueDate,
      amountPkr: member.balance || mockPlanPrice(member.plan),
      memberStatus: member.status,
      renewalStatus: member.status === 'Dues Pending' || member.status === 'Suspended'
        ? 'overdue'
        : member.status === 'Balance Due'
          ? 'reminder_queued'
          : 'scheduled',
      recommendedAction: member.status === 'Balance Due'
        ? 'Collect balance'
        : member.status === 'Dues Pending' || member.status === 'Suspended'
          ? 'Send due reminder'
          : 'Schedule reminder',
    }))
}

function mockTenantAuditLogs(session?: AuthSession): AuditLog[] {
  const tenantId = session?.tenantId ?? 'tenant_fitzone_khi'
  return [
    {
      id: 'mock-audit-member-created',
      scope: 'tenant',
      tenantId,
      actorUserId: 'mock-tenant-admin',
      actorName: session?.name ?? 'Tenant Admin',
      action: 'member.created',
      entityType: 'member',
      entityId: 'GF-2026-00289',
      metadata: { source: 'demo' },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'mock-audit-payment-created',
      scope: 'tenant',
      tenantId,
      actorUserId: 'mock-tenant-admin',
      actorName: session?.name ?? 'Tenant Admin',
      action: 'payment.created',
      entityType: 'payment',
      entityId: 'RCP-2026-00143',
      metadata: { amountPkr: 4500 },
      createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
    {
      id: 'mock-audit-reminder-queued',
      scope: 'tenant',
      tenantId,
      actorUserId: 'mock-staff',
      actorName: 'Front Desk Staff',
      action: 'notification.reminder_queued',
      entityType: 'notification',
      entityId: 'mock-notification-1',
      metadata: { channel: 'whatsapp' },
      createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
  ]
}

function mockPlatformAuditLogs(session?: AuthSession): AuditLog[] {
  return [
    {
      id: 'mock-platform-tenant-created',
      scope: 'platform',
      tenantId: null,
      actorUserId: 'mock-super-admin',
      actorName: session?.name ?? 'GymFlow Operations',
      action: 'tenant.provisioned',
      entityType: 'tenant',
      entityId: 'tenant_newgym_lhr',
      metadata: { planCode: 'growth' },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'mock-platform-plan-upserted',
      scope: 'platform',
      tenantId: null,
      actorUserId: 'mock-super-admin',
      actorName: session?.name ?? 'GymFlow Operations',
      action: 'platform_plan.upserted',
      entityType: 'platform_plan',
      entityId: 'growth',
      metadata: { monthlyPricePkr: 24000 },
      createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    },
  ]
}

function defaultMockBillingInvoices(): PlatformBillingInvoice[] {
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return mockGymFlowApi.platform.getTenants().slice(0, 2).map((tenant, index) => ({
    id: `mock-invoice-${tenant.id}`,
    invoiceNumber: `INV-${now.getFullYear()}-${String(index + 1).padStart(5, '0')}`,
    tenantId: tenant.id,
    tenantName: tenant.name,
    planName: tenant.plan,
    amountPkr: tenant.plan === 'Professional' ? 42000 : tenant.plan === 'Starter' ? 12000 : 24000,
    status: index === 0 ? 'issued' : 'paid',
    periodStart,
    periodEnd,
    dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString().slice(0, 10),
    paidAt: index === 0 ? null : new Date().toISOString(),
    provider: index === 0 ? 'manual' : 'external_stub',
    providerReference: index === 0 ? null : `GF-PAY-${Date.now()}`,
    createdAt: new Date(Date.now() - index * 86400000).toISOString(),
  }))
}

function readMockBillingInvoices() {
  const storedInvoices = window.localStorage.getItem(mockBillingInvoicesKey)
  if (!storedInvoices) return defaultMockBillingInvoices()
  try {
    const parsedInvoices = JSON.parse(storedInvoices) as PlatformBillingInvoice[]
    return Array.isArray(parsedInvoices) ? parsedInvoices : defaultMockBillingInvoices()
  } catch {
    return defaultMockBillingInvoices()
  }
}

function writeMockBillingInvoices(invoices: PlatformBillingInvoice[]) {
  window.localStorage.setItem(mockBillingInvoicesKey, JSON.stringify(invoices))
}

function mockBillingSummary(invoices: PlatformBillingInvoice[]): PlatformBillingSummary {
  const plans = mockGymFlowApi.platform.getPlans()
  const mrrPkr = plans.reduce((sum, plan) => sum + (Number(plan.price.replace(/\D/g, '')) || 0), 0)
  return {
    mrrPkr,
    issuedPkr: invoices.filter((invoice) => invoice.status === 'issued' || invoice.status === 'overdue').reduce((sum, invoice) => sum + invoice.amountPkr, 0),
    paidPkr: invoices.filter((invoice) => invoice.status === 'paid').reduce((sum, invoice) => sum + invoice.amountPkr, 0),
    overduePkr: invoices.filter((invoice) => invoice.status === 'overdue').reduce((sum, invoice) => sum + invoice.amountPkr, 0),
    openInvoiceCount: invoices.filter((invoice) => invoice.status === 'issued' || invoice.status === 'overdue').length,
  }
}

async function requestBackend<T>(path: string, options: RequestInit = {}) {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch {
    throw new Error(`API is not reachable at ${apiBaseUrl}. Check backend service and reverse proxy.`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const body = await response.text()
    const responseHint = body.trim().startsWith('<') ? 'HTML' : 'non-JSON'
    throw new Error(`API returned ${responseHint} instead of JSON from ${apiBaseUrl}${path}. Check API URL/proxy configuration.`)
  }

  const payload = await response.json() as ApiResponse<T>
  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.error?.message ?? 'Backend request failed.')
  }
  return payload.data
}

function loginCredentialsFor(option: AuthSession) {
  if (option.role === 'super-admin') {
    return { email: 'ops@gymflow.pk', password: 'demo', portal: 'super-admin' as const }
  }

  if (option.role === 'staff') {
    return { email: 'staff@fitzone.pk', password: 'demo', portal: 'tenant' as const, tenantSlug: option.tenantSlug ?? 'fitzone-khi' }
  }

  return { email: 'admin@fitzone.pk', password: 'demo', portal: 'tenant' as const, tenantSlug: option.tenantSlug ?? 'fitzone-khi' }
}

export const gymFlowApi = {
  mode: {
    get: getStoredApiMode,
    set: storeApiMode,
    baseUrl: getApiBaseUrl,
    isMockAllowed: isMockModeAllowed,
  },
  auth: {
    listLoginOptions: () => mockGymFlowApi.auth.listLoginOptions(),
    login: async (option: AuthSession, mode: ApiMode): Promise<AuthSession> => {
      if (mode === 'mock') return { ...option, apiMode: 'mock' }

      const data = await requestBackend<{ accessToken: string; portal: Portal; user: BackendUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginCredentialsFor(option)),
      })

      return {
        portal: data.portal,
        role: data.user.role,
        name: data.user.name,
        title: option.title,
        workspace: option.workspace,
        url: option.url,
        accessToken: data.accessToken,
        tenantId: data.user.tenantId,
        tenantSlug: option.tenantSlug,
        apiMode: 'backend',
      }
    },
  },
  tenant: {
    getMembers: async (session: AuthSession): Promise<Member[]> => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return readMockMembers(session)
      }

      const data = await requestBackend<{ members: BackendMember[] }>('/tenant/members', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
      })
      return data.members.map(mapBackendMember)
    },
    createMember: async (session: AuthSession, input: CreateMemberInput): Promise<Member> => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        const members = readMockMembers(session)
        const member = {
          id: nextMockMemberCode(members),
          name: input.name,
          phone: input.phone,
          branch: input.branchName,
          plan: input.planName,
          dueDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          balance: mockPlanPrice(input.planName),
          status: 'Active',
          lastPayment: '',
        } satisfies Member
        writeMockMembers(session, [member, ...members])
        return member
      }

      const data = await requestBackend<CreateMemberResponse>('/tenant/members', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
        body: JSON.stringify(input),
      })
      return mapBackendMember(data.member)
    },
    updateMember: async (session: AuthSession, member: Member, input: UpdateMemberInput): Promise<Member> => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        const updatedMember = {
          ...member,
          name: input.name ?? member.name,
          phone: input.phone ?? member.phone,
          branch: input.branchName ?? member.branch,
          plan: input.planName ?? member.plan,
          dueDate: input.dueDate ?? member.dueDate,
          status: input.status ?? member.status,
        } satisfies Member
        writeMockMembers(
          session,
          readMockMembers(session).map((currentMember) => currentMember.id === member.id ? updatedMember : currentMember),
        )
        return updatedMember
      }

      const data = await requestBackend<UpdateMemberResponse>(`/tenant/members/${encodeURIComponent(member.sourceId ?? member.id)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
        body: JSON.stringify({
          name: input.name,
          phone: input.phone,
          branchName: input.branchName,
          planName: input.planName,
          dueDate: toIsoDate(input.dueDate),
          status: input.status ? toBackendStatus(input.status) : undefined,
        }),
      })
      return mapBackendMember(data.member)
    },
    sendReminder: async (session: AuthSession, member: Member) => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return {
          notification: {
            id: `mock-${Date.now()}`,
            memberId: member.sourceId ?? member.id,
            triggerCode: 'due_3_days',
            channel: 'whatsapp' as const,
            status: 'queued',
          },
        }
      }

      return requestBackend<SendReminderResponse>('/tenant/notifications/reminders', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
        body: JSON.stringify({
          memberId: member.sourceId ?? member.id,
          triggerCode: 'due_3_days',
          channel: 'whatsapp',
        }),
      })
    },
    createPayment: async (session: AuthSession, input: CreatePaymentRequest) => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        const amountDue = Math.max(0, (input.member.balance || mockPlanPrice(input.member.plan)) + input.lateFeePkr - input.discountPkr)
        const outstandingAfter = Math.max(0, amountDue - input.amountPaidPkr)
        writeMockMembers(
          session,
          readMockMembers(session).map((member) =>
            member.id === input.member.id
              ? {
                  ...member,
                  balance: outstandingAfter,
                  status: outstandingAfter > 0 ? 'Balance Due' : 'Active',
                  lastPayment: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                }
              : member,
          ),
        )
        return { ok: true }
      }

      return requestBackend('/tenant/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
        body: JSON.stringify({
          memberId: input.member.sourceId ?? input.member.id,
          amountPaidPkr: input.amountPaidPkr,
          discountPkr: input.discountPkr,
          lateFeePkr: input.lateFeePkr,
          method: input.method,
          transactionId: input.transactionId,
        }),
      })
    },
    getRenewals: async (session: AuthSession): Promise<RenewalQueueItem[]> => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return mockRenewalsFromMembers(readMockMembers(session))
      }

      const data = await requestBackend<{ renewals: Array<Omit<RenewalQueueItem, 'memberStatus'> & { memberStatus: BackendMember['status'] }> }>('/tenant/renewals', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
      })
      return data.renewals.map((renewal) => ({
        ...renewal,
        memberStatus: statusLabelFromBackend(renewal.memberStatus),
      }))
    },
    updateRenewal: async (session: AuthSession, renewal: RenewalQueueItem, action: 'paid' | 'overdue' | 'reminder_queued') => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        const renewalStatus: RenewalQueueItem['renewalStatus'] = action === 'reminder_queued' ? 'reminder_queued' : action
        return { renewal: { ...renewal, renewalStatus } }
      }

      const data = await requestBackend<{ renewal: Omit<RenewalQueueItem, 'memberStatus'> & { memberStatus: BackendMember['status'] } }>(
        `/tenant/renewals/${encodeURIComponent(renewal.memberId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'X-Tenant-ID': session.tenantId,
          },
          body: JSON.stringify({
            action,
            channel: 'whatsapp',
          }),
        },
      )
      return {
        renewal: {
          ...data.renewal,
          memberStatus: statusLabelFromBackend(data.renewal.memberStatus),
        },
      }
    },
    getNotifications: async (session: AuthSession): Promise<NotificationLog[]> => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return mockGymFlowApi.tenant.getNotifications().map((notification, index) => ({
          id: `mock-${index}`,
          memberId: notification.member,
          memberName: notification.member,
          triggerCode: notification.trigger,
          channel: notification.channel.toLowerCase() as NotificationLog['channel'],
          status: notification.status.toLowerCase() as NotificationLog['status'],
          failureReason: notification.status === 'Failed' ? 'Provider timeout' : null,
          createdAt: notification.time,
        }))
      }

      const data = await requestBackend<{ notifications: NotificationLog[] }>('/tenant/notifications', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
      })
      return data.notifications
    },
    retryNotification: async (session: AuthSession, notification: NotificationLog) => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return { notification: { ...notification, id: `mock-retry-${Date.now()}`, status: 'queued' as const } }
      }

      return requestBackend<{ notification: NotificationLog }>(
        `/tenant/notifications/${encodeURIComponent(notification.id)}/retry`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'X-Tenant-ID': session.tenantId,
          },
        },
      )
    },
    getSettings: async (session: AuthSession): Promise<TenantSettings> => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return {
          branches: [
            { id: 'br_main', name: 'Main Branch', city: 'Karachi', address: null, isActive: true },
            { id: 'br_dha', name: 'DHA Branch', city: 'Karachi', address: null, isActive: true },
          ],
          membershipPlans: [
            { id: 'plan_monthly_basic', name: 'Monthly Basic', billingCycle: 'monthly', pricePkr: 3500, graceDays: 3, isActive: true },
            { id: 'plan_monthly_pro', name: 'Monthly Pro', billingCycle: 'monthly', pricePkr: 4500, graceDays: 3, isActive: true },
          ],
          staffAccess: [
            { role: 'tenant-admin', label: 'Tenant Admin', canManageMembers: true, canRecordPayments: true, canManageSettings: true },
            { role: 'staff', label: 'Front Desk Staff', canManageMembers: true, canRecordPayments: true, canManageSettings: false },
          ],
        }
      }

      return requestBackend<TenantSettings>('/tenant/settings', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
      })
    },
    getAuditLogs: async (session: AuthSession): Promise<AuditLog[]> => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return mockTenantAuditLogs(session)
      }

      const data = await requestBackend<{ auditLogs: AuditLog[] }>('/tenant/audit-log', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
      })
      return data.auditLogs
    },
    createBranch: async (session: AuthSession, input: { name: string; city: string; address?: string }) => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return {
          branch: {
            id: `mock-branch-${Date.now()}`,
            name: input.name,
            city: input.city,
            address: input.address ?? null,
            isActive: true,
          },
        }
      }

      return requestBackend<{ branch: TenantSettings['branches'][number] }>('/tenant/settings/branches', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId ?? '',
        },
        body: JSON.stringify(input),
      })
    },
    updateBranch: async (
      session: AuthSession,
      branch: TenantSettings['branches'][number],
      input: Partial<{ name: string; city: string; address: string | null; isActive: boolean }>,
    ) => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return {
          branch: {
            ...branch,
            ...input,
          },
        }
      }

      return requestBackend<{ branch: TenantSettings['branches'][number] }>(
        `/tenant/settings/branches/${encodeURIComponent(branch.id)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'X-Tenant-ID': session.tenantId ?? '',
          },
          body: JSON.stringify(input),
        },
      )
    },
    createMembershipPlan: async (session: AuthSession, input: { name: string; billingCycle: 'monthly' | 'quarterly' | 'annual'; pricePkr: number; graceDays: number }) => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return {
          plan: {
            id: `mock-plan-${Date.now()}`,
            name: input.name,
            billingCycle: input.billingCycle,
            pricePkr: input.pricePkr,
            graceDays: input.graceDays,
            isActive: true,
          },
        }
      }

      return requestBackend<{ plan: TenantSettings['membershipPlans'][number] }>('/tenant/settings/membership-plans', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId ?? '',
        },
        body: JSON.stringify(input),
      })
    },
    updateMembershipPlan: async (
      session: AuthSession,
      plan: TenantSettings['membershipPlans'][number],
      input: Partial<{
        name: string
        billingCycle: 'monthly' | 'quarterly' | 'annual'
        pricePkr: number
        graceDays: number
        isActive: boolean
      }>,
    ) => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return {
          plan: {
            ...plan,
            ...input,
          },
        }
      }

      return requestBackend<{ plan: TenantSettings['membershipPlans'][number] }>(
        `/tenant/settings/membership-plans/${encodeURIComponent(plan.id)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'X-Tenant-ID': session.tenantId ?? '',
          },
          body: JSON.stringify(input),
        },
      )
    },
    getReportSummary: async (session: AuthSession): Promise<TenantReportSummary> => {
      if (session.apiMode !== 'backend' || !session.accessToken || !session.tenantId) {
        return {
          collectionsPkr: 714000,
          outstandingDuesPkr: 318700,
          renewalDueCount: 142,
          activeMembers: 1284,
          suspendedMembers: 23,
          paymentMethodBreakdown: [
            { method: 'cash', amountPkr: 314000 },
            { method: 'easypaisa', amountPkr: 194000 },
          ],
        }
      }

      return requestBackend<TenantReportSummary>('/tenant/reports/summary', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'X-Tenant-ID': session.tenantId,
        },
      })
    },
  },
  platform: {
    getTenants: async (session: AuthSession) => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        return mockGymFlowApi.platform.getTenants()
      }

      const data = await requestBackend<{ tenants: BackendTenant[] }>('/platform/tenants', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })

      return data.tenants.map(mapBackendTenant)
    },
    provisionTenant: async (session: AuthSession, input: ProvisionTenantInput) => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        return {
          tenant: {
            id: `tenant_${input.slug.replaceAll('-', '_')}`,
            name: input.name,
            slug: input.slug,
            plan: planNameForCode(input.planCode),
            status: 'Trial',
            members: 0,
            revenue: 0,
            databaseName: `tenant_${input.slug.replaceAll('-', '_')}`,
            primaryDomain: `${input.slug}.gymflow.pk`,
            provisioningStatus: 'completed',
          } satisfies PlatformTenant,
          job: {
            status: 'completed',
            step: 'mock_provisioned',
          },
        }
      }

      const data = await requestBackend<ProvisionTenantResponse>('/platform/tenants', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify(input),
      })

      return {
        tenant: mapBackendTenant(data.tenant),
        job: data.job,
      }
    },
    updateTenantStatus: async (session: AuthSession, tenant: PlatformTenant, status: PlatformTenantStatus) => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        return {
          ...tenant,
          status,
        }
      }

      const data = await requestBackend<{ tenant: BackendTenant }>(`/platform/tenants/${encodeURIComponent(tenant.id)}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          status: tenantStatusToBackend(status),
        }),
      })
      return mapBackendTenant(data.tenant)
    },
    getPlans: async (session: AuthSession): Promise<PlatformPlan[]> => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        return mockGymFlowApi.platform.getPlans().map((plan, index) => ({
          id: `mock-plan-${index}`,
          code: plan.name.toLowerCase(),
          name: plan.name,
          monthlyPricePkr: Number(plan.price.replace(/\D/g, '')) || 0,
          maxBranches: plan.name === 'Starter' ? 1 : plan.name === 'Growth' ? 3 : null,
          maxMembers: plan.name === 'Starter' ? 500 : plan.name === 'Growth' ? 2000 : null,
          whatsappEnabled: true,
          smsEnabled: true,
          advancedReportsEnabled: plan.name !== 'Starter',
          isActive: true,
        }))
      }

      const data = await requestBackend<{ plans: PlatformPlan[] }>('/platform/plans', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
      return data.plans
    },
    upsertPlan: async (session: AuthSession, input: Omit<PlatformPlan, 'id'>) => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        return { plan: { ...input, id: `mock-plan-${Date.now()}` } }
      }

      return requestBackend<{ plan: PlatformPlan }>('/platform/plans', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify(input),
      })
    },
    updateTenantPlan: async (session: AuthSession, tenant: PlatformTenant, planCode: string) => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        return {
          ...tenant,
          plan: planNameForCode(planCode),
        }
      }

      const data = await requestBackend<{ tenant: BackendTenant }>(`/platform/tenants/${encodeURIComponent(tenant.id)}/plan`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ planCode }),
      })
      return mapBackendTenant(data.tenant)
    },
    getTenantStats: async (session: AuthSession): Promise<PlatformTenantStats[]> => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        return mockGymFlowApi.platform.getTenants().map((tenant) => ({
          tenantId: tenant.id,
          activeMembers: tenant.members,
          suspendedMembers: tenant.status === 'Suspended' ? 1 : 0,
          monthlyRevenuePkr: tenant.revenue,
          outstandingDuesPkr: Math.round(tenant.revenue * 0.18),
          renewalDueCount: Math.round(tenant.members * 0.16),
        }))
      }

      const data = await requestBackend<{ stats: PlatformTenantStats[] }>('/platform/tenant-stats', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
      return data.stats
    },
    getBilling: async (session: AuthSession): Promise<{ summary: PlatformBillingSummary; invoices: PlatformBillingInvoice[] }> => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        const invoices = readMockBillingInvoices()
        return {
          summary: mockBillingSummary(invoices),
          invoices,
        }
      }

      return requestBackend<{ summary: PlatformBillingSummary; invoices: PlatformBillingInvoice[] }>('/platform/billing', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
    },
    createBillingInvoice: async (session: AuthSession, tenant: PlatformTenant): Promise<{ invoice: PlatformBillingInvoice }> => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        const now = new Date()
        const invoices = readMockBillingInvoices()
        const invoice: PlatformBillingInvoice = {
          id: `mock-invoice-${Date.now()}`,
          invoiceNumber: `INV-${now.getFullYear()}-${String(invoices.length + 1).padStart(5, '0')}`,
          tenantId: tenant.id,
          tenantName: tenant.name,
          planName: tenant.plan,
          amountPkr: tenant.plan === 'Professional' ? 42000 : tenant.plan === 'Starter' ? 12000 : 24000,
          status: 'issued',
          periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
          periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
          dueDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString().slice(0, 10),
          paidAt: null,
          provider: 'manual',
          providerReference: null,
          createdAt: now.toISOString(),
        }
        writeMockBillingInvoices([invoice, ...invoices])
        return { invoice }
      }

      return requestBackend<{ invoice: PlatformBillingInvoice }>('/platform/billing/invoices', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ tenantId: tenant.id }),
      })
    },
    markBillingInvoicePaid: async (session: AuthSession, invoice: PlatformBillingInvoice): Promise<{ invoice: PlatformBillingInvoice }> => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        const paidInvoice: PlatformBillingInvoice = {
          ...invoice,
          status: 'paid',
          paidAt: new Date().toISOString(),
          provider: 'external_stub',
          providerReference: `GF-PAY-${Date.now()}`,
        }
        writeMockBillingInvoices(readMockBillingInvoices().map((currentInvoice) => currentInvoice.id === invoice.id ? paidInvoice : currentInvoice))
        return { invoice: paidInvoice }
      }

      return requestBackend<{ invoice: PlatformBillingInvoice }>(
        `/platform/billing/invoices/${encodeURIComponent(invoice.id)}/paid`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
        },
      )
    },
    getAuditLogs: async (session: AuthSession): Promise<AuditLog[]> => {
      if (session.apiMode !== 'backend' || !session.accessToken) {
        return mockPlatformAuditLogs(session)
      }

      const data = await requestBackend<{ auditLogs: AuditLog[] }>('/platform/audit-log', {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      })
      return data.auditLogs
    },
  },
  static: mockGymFlowApi,
}
