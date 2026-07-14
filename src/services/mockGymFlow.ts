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

const members: Member[] = [
  {
    id: 'GF-2026-00284',
    name: 'Ali Raza',
    phone: '+92 300 129 8821',
    branch: 'DHA Branch',
    plan: 'Monthly Pro',
    dueDate: '22 Jul 2026',
    balance: 0,
    status: 'Active',
    lastPayment: '10 Jul 2026',
  },
  {
    id: 'GF-2026-00285',
    name: 'Hira Khan',
    phone: '+92 321 663 4481',
    branch: 'Main Branch',
    plan: 'Monthly Basic',
    dueDate: '13 Jul 2026',
    balance: 1700,
    status: 'Balance Due',
    lastPayment: '08 Jul 2026',
  },
  {
    id: 'GF-2026-00286',
    name: 'Usman Malik',
    phone: '+92 333 554 1187',
    branch: 'Gulberg',
    plan: 'Quarterly Elite',
    dueDate: '10 Jul 2026',
    balance: 3500,
    status: 'Dues Pending',
    lastPayment: '09 Jun 2026',
  },
  {
    id: 'GF-2026-00287',
    name: 'Sara Ahmed',
    phone: '+92 302 900 7814',
    branch: 'Main Branch',
    plan: 'Monthly Basic',
    dueDate: '04 Jul 2026',
    balance: 3500,
    status: 'Suspended',
    lastPayment: '03 Jun 2026',
  },
  {
    id: 'GF-2026-00288',
    name: 'Bilal Shah',
    phone: '+92 345 110 4432',
    branch: 'DHA Branch',
    plan: 'Annual Elite',
    dueDate: '29 Jul 2026',
    balance: 0,
    status: 'Active',
    lastPayment: '01 Jul 2026',
  },
]

const revenueByChannel = [
  { day: 'Mon', cash: 52000, digital: 38000 },
  { day: 'Tue', cash: 61000, digital: 45000 },
  { day: 'Wed', cash: 47000, digital: 51000 },
  { day: 'Thu', cash: 72000, digital: 44000 },
  { day: 'Fri', cash: 68000, digital: 57000 },
  { day: 'Sat', cash: 89000, digital: 62000 },
  { day: 'Sun', cash: 39000, digital: 31000 },
]

const paymentMix = [
  { name: 'Cash', value: 44, color: '#2563eb' },
  { name: 'EasyPaisa', value: 22, color: '#16a34a' },
  { name: 'JazzCash', value: 18, color: '#d97706' },
  { name: 'Card/Bank', value: 16, color: '#7c3aed' },
]

const renewalData = [
  { window: '7d', members: 38 },
  { window: '14d', members: 74 },
  { window: '30d', members: 142 },
]

const renewalQueue = [
  { member: 'Usman Malik', plan: 'Quarterly Elite', due: 'Today', amount: 3500, state: 'Dues Pending', action: 'Send due reminder' },
  { member: 'Hira Khan', plan: 'Monthly Basic', due: '13 Jul 2026', amount: 1700, state: 'Balance Due', action: 'Collect balance' },
  { member: 'Ali Raza', plan: 'Monthly Pro', due: '22 Jul 2026', amount: 4500, state: 'Active', action: 'Schedule reminder' },
  { member: 'Bilal Shah', plan: 'Annual Elite', due: '29 Jul 2026', amount: 12000, state: 'Active', action: 'Schedule reminder' },
] satisfies Array<{
  member: string
  plan: string
  due: string
  amount: number
  state: MemberStatus
  action: string
}>

const reminderPlan = [
  { trigger: 'expiry_7d', count: 38, channel: 'WhatsApp + SMS', time: '8:00 AM' },
  { trigger: 'expiry_3d', count: 21, channel: 'WhatsApp + SMS', time: '8:00 AM' },
  { trigger: 'due_today', count: 9, channel: 'WhatsApp + SMS', time: '8:00 AM' },
  { trigger: 'overdue_1d', count: 6, channel: 'WhatsApp + SMS', time: '8:00 AM' },
]

const notifications = [
  { trigger: 'payment_received', channel: 'WhatsApp', status: 'Delivered', member: 'Ali Raza', time: '9:42 AM' },
  { trigger: 'overdue_1d', channel: 'SMS', status: 'Sent', member: 'Usman Malik', time: '8:00 AM' },
  { trigger: 'suspended', channel: 'WhatsApp', status: 'Failed', member: 'Sara Ahmed', time: 'Yesterday' },
  { trigger: 'expiry_3d', channel: 'SMS', status: 'Delivered', member: 'Hira Khan', time: 'Yesterday' },
]

const notificationTemplates = [
  { trigger: 'expiry_7d', purpose: '7 days before due date', whatsapp: true, sms: true, email: false, status: 'Active' },
  { trigger: 'expiry_3d', purpose: '3 days before due date', whatsapp: true, sms: true, email: false, status: 'Active' },
  { trigger: 'due_today', purpose: 'Payment due today', whatsapp: true, sms: true, email: false, status: 'Active' },
  { trigger: 'overdue_1d', purpose: 'One day overdue', whatsapp: true, sms: true, email: false, status: 'Active' },
  { trigger: 'suspended', purpose: 'Grace period expired', whatsapp: true, sms: true, email: false, status: 'Active' },
  { trigger: 'payment_received', purpose: 'Receipt confirmation', whatsapp: true, sms: true, email: false, status: 'Active' },
]

const failedNotifications = [
  { member: 'Sara Ahmed', trigger: 'suspended', channel: 'WhatsApp', reason: '360dialog timeout', time: 'Yesterday' },
  { member: 'Usman Malik', trigger: 'overdue_1d', channel: 'SMS', reason: 'Gateway pending', time: '8:01 AM' },
]

const optOutMembers = [
  { member: 'Noman Iqbal', channel: 'WhatsApp', fallback: 'SMS active', updated: '09 Jul 2026' },
  { member: 'Maham Tariq', channel: 'WhatsApp', fallback: 'SMS active', updated: '02 Jul 2026' },
]

const tenants = [
  {
    id: 'tenant_fitzone_khi',
    name: 'FitZone Karachi',
    slug: 'fitzone-khi',
    plan: 'Growth',
    status: 'Active',
    members: 1284,
    revenue: 714000,
    databaseName: 'tenant_fitzone_khi',
    primaryDomain: 'fitzone-khi.gymflow.pk',
    provisioningStatus: 'completed',
  },
  {
    id: 'tenant_irontemple_lhr',
    name: 'Iron Temple Lahore',
    slug: 'irontemple-lhr',
    plan: 'Professional',
    status: 'Trial',
    members: 3420,
    revenue: 1280000,
    databaseName: 'tenant_irontemple_lhr',
    primaryDomain: 'irontemple-lhr.gymflow.pk',
    provisioningStatus: 'completed',
  },
  {
    id: 'tenant_powerhouse_isl',
    name: 'PowerHouse Islamabad',
    slug: 'powerhouse-isl',
    plan: 'Starter',
    status: 'Active',
    members: 188,
    revenue: 92000,
    databaseName: 'tenant_powerhouse_isl',
    primaryDomain: 'powerhouse-isl.gymflow.pk',
    provisioningStatus: 'completed',
  },
]

export type PlatformTenant = (typeof tenants)[number]
export type PlatformTenantStatus = PlatformTenant['status']

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

const activity = [
  'Partial payment recorded for Hira Khan. Membership stays active.',
  'Scheduler moved Usman Malik to dues pending.',
  'Sara Ahmed suspended after grace period expired.',
  'Tenant stats synced for FitZone Karachi.',
]

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
