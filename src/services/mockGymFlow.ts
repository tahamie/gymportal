export type Portal = 'tenant' | 'super-admin'
export type LoginRole = 'tenant-admin' | 'staff' | 'super-admin'

export type AuthSession = {
  portal: Portal
  role: LoginRole
  name: string
  title: string
  workspace: string
  url: string
  accessToken?: string
  tenantId?: string
  tenantSlug?: string
  apiMode?: 'mock' | 'backend'
}

export type MemberStatus = 'Active' | 'Balance Due' | 'Dues Pending' | 'Suspended' | 'Cancelled'

export type Member = {
  id: string
  sourceId?: string
  name: string
  phone: string
  branch: string
  plan: string
  dueDate: string
  balance: number
  status: MemberStatus
  lastPayment: string
}

export type CreateMemberInput = {
  name: string
  phone: string
  branchName: string
  planName: string
}

export type UpdateMemberInput = Partial<CreateMemberInput> & {
  status?: MemberStatus
  dueDate?: string
}

export type PaymentMethod = 'cash' | 'easypaisa' | 'jazzcash' | 'card' | 'bank_transfer'

export type TenantPayment = {
  id: string
  receiptNo: string
  memberId: string
  amountPaidPkr: number
  discountPkr: number
  lateFeePkr: number
  method: PaymentMethod
  transactionId: string | null
  paymentType: 'full' | 'partial'
  outstandingAfterPkr: number
  extendsExpiry: boolean
  collectedBy: string
  collectedAt: string
}

export type AuditLog = {
  id: string
  scope: 'tenant' | 'platform'
  tenantId: string | null
  actorUserId: string
  actorName: string
  action: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

const loginOptions: AuthSession[] = [
  {
    portal: 'tenant',
    role: 'tenant-admin',
    name: 'Ayesha Siddiqui',
    title: 'Tenant Admin',
    workspace: 'FitZone Karachi',
    url: 'fitzone-khi.gymflow.pk',
    tenantId: 'tenant_fitzone_khi',
    tenantSlug: 'fitzone-khi',
  },
  {
    portal: 'tenant',
    role: 'staff',
    name: 'Sana Javed',
    title: 'Front Desk Staff',
    workspace: 'FitZone Karachi',
    url: 'fitzone-khi.gymflow.pk',
    tenantId: 'tenant_fitzone_khi',
    tenantSlug: 'fitzone-khi',
  },
  {
    portal: 'super-admin',
    role: 'super-admin',
    name: 'GymFlow Operations',
    title: 'Super Admin',
    workspace: 'GymFlow HQ',
    url: 'app.gymflow.pk',
  },
]

const members: Member[] = []

const revenueByChannel: Array<{ day: string; cash: number; digital: number }> = []

const paymentMix: Array<{ name: string; value: number; color: string }> = []

const renewalData: Array<{ window: string; members: number }> = []

const renewalQueue: Array<{
  member: string
  plan: string
  due: string
  amount: number
  state: MemberStatus
  action: string
}> = []

const reminderPlan = [
  { trigger: 'expiry_7d', count: 0, channel: 'WhatsApp + SMS', time: '8:00 AM' },
  { trigger: 'expiry_3d', count: 0, channel: 'WhatsApp + SMS', time: '8:00 AM' },
  { trigger: 'due_today', count: 0, channel: 'WhatsApp + SMS', time: '8:00 AM' },
  { trigger: 'overdue_1d', count: 0, channel: 'WhatsApp + SMS', time: '8:00 AM' },
]

const notifications: Array<{ trigger: string; channel: string; status: string; member: string; time: string }> = []

const notificationTemplates = [
  { trigger: 'expiry_7d', purpose: '7 days before due date', whatsapp: true, sms: true, email: false, status: 'Active' },
  { trigger: 'expiry_3d', purpose: '3 days before due date', whatsapp: true, sms: true, email: false, status: 'Active' },
  { trigger: 'due_today', purpose: 'Payment due today', whatsapp: true, sms: true, email: false, status: 'Active' },
  { trigger: 'overdue_1d', purpose: 'One day overdue', whatsapp: true, sms: true, email: false, status: 'Active' },
  { trigger: 'suspended', purpose: 'Grace period expired', whatsapp: true, sms: true, email: false, status: 'Active' },
  { trigger: 'payment_received', purpose: 'Receipt confirmation', whatsapp: true, sms: true, email: false, status: 'Active' },
]

const failedNotifications: Array<{ member: string; trigger: string; channel: string; reason: string; time: string }> = []

const optOutMembers: Array<{ member: string; channel: string; fallback: string; updated: string }> = []

export type PlatformTenantStatus = 'Active' | 'Trial' | 'Suspended' | 'Cancelled'

export type PlatformTenant = {
  id: string
  name: string
  slug: string
  plan: string
  status: PlatformTenantStatus
  members: number
  revenue: number
  databaseName: string
  primaryDomain: string
  provisioningStatus: string
}

const tenants: PlatformTenant[] = []

export type RenewalQueueItem = {
  memberId: string
  memberName: string
  memberCode: string
  planName: string
  branchName: string
  dueDate: string
  amountPkr: number
  memberStatus: MemberStatus
  renewalStatus: 'scheduled' | 'reminder_queued' | 'paid' | 'overdue'
  recommendedAction: string
}

export type NotificationLog = {
  id: string
  memberId: string
  memberName: string
  triggerCode: string
  channel: 'whatsapp' | 'sms' | 'email'
  status: 'queued' | 'sent' | 'delivered' | 'failed'
  failureReason: string | null
  createdAt: string
}

export type TenantSettings = {
  branches: Array<{ id: string; name: string; city: string; address: string | null; isActive: boolean }>
  membershipPlans: Array<{
    id: string
    name: string
    billingCycle: 'monthly' | 'quarterly' | 'annual'
    pricePkr: number
    graceDays: number
    isActive: boolean
  }>
  staffAccess: Array<{
    role: 'tenant-admin' | 'staff'
    label: string
    canManageMembers: boolean
    canRecordPayments: boolean
    canManageSettings: boolean
  }>
}

export type TenantReportSummary = {
  collectionsPkr: number
  outstandingDuesPkr: number
  renewalDueCount: number
  activeMembers: number
  suspendedMembers: number
  paymentMethodBreakdown: Array<{ method: PaymentMethod; amountPkr: number }>
}

export type PlatformPlan = {
  id: string
  code: string
  name: string
  monthlyPricePkr: number
  maxBranches: number | null
  maxMembers: number | null
  whatsappEnabled: boolean
  smsEnabled: boolean
  advancedReportsEnabled: boolean
  isActive: boolean
}

export type PlatformTenantStats = {
  tenantId: string
  activeMembers: number
  suspendedMembers: number
  monthlyRevenuePkr: number
  outstandingDuesPkr: number
  renewalDueCount: number
}

export type PlatformBillingInvoice = {
  id: string
  invoiceNumber: string
  tenantId: string
  tenantName: string
  planName: string
  amountPkr: number
  status: 'issued' | 'paid' | 'overdue' | 'void'
  periodStart: string
  periodEnd: string
  dueDate: string
  paidAt: string | null
  provider: 'manual' | 'external_stub'
  providerReference: string | null
  createdAt: string
}

export type PlatformBillingSummary = {
  mrrPkr: number
  issuedPkr: number
  paidPkr: number
  overduePkr: number
  openInvoiceCount: number
}

export type ProvisionTenantInput = {
  name: string
  slug: string
  planCode: string
  adminName: string
  adminEmail: string
  city: string
  branchName: string
}

const activity: string[] = []

const platformPlans = [
  { name: 'Starter', price: 'PKR 12,000/mo', tenants: 8, limits: '1 branch · 500 members · SMS + WhatsApp' },
  { name: 'Growth', price: 'PKR 24,000/mo', tenants: 13, limits: '3 branches · 2,000 members · reports' },
  { name: 'Professional', price: 'PKR 42,000/mo', tenants: 3, limits: 'Unlimited branches · advanced controls' },
]

const provisioningSteps = [
  { title: 'Tenant profile', detail: 'Gym legal name, owner, plan, timezone, PKR billing.' },
  { title: 'Isolated database', detail: 'Create tenant database, schema seed, roles, and audit log.' },
  { title: 'Domain routing', detail: 'Reserve subdomain, branch defaults, and branded login URL.' },
  { title: 'Admin invite', detail: 'Send first Super Admin approved tenant admin invitation.' },
]

export const mockGymFlowApi = {
  auth: {
    listLoginOptions: () => loginOptions,
  },
  tenant: {
    getMembers: () => members,
    getRevenueByChannel: () => revenueByChannel,
    getPaymentMix: () => paymentMix,
    getRenewalData: () => renewalData,
    getRenewalQueue: () => renewalQueue,
    getReminderPlan: () => reminderPlan,
    getNotifications: () => notifications,
    getNotificationTemplates: () => notificationTemplates,
    getFailedNotifications: () => failedNotifications,
    getOptOutMembers: () => optOutMembers,
    getActivity: () => activity,
  },
  platform: {
    getTenants: () => tenants,
    getPlans: () => platformPlans,
    getProvisioningSteps: () => provisioningSteps,
  },
}
