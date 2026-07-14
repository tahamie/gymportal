export type Portal = 'tenant' | 'super-admin'
export type Role = 'tenant-admin' | 'staff' | 'super-admin'

export type UserSession = {
  id: string
  name: string
  email: string
  role: Role
  portal: Portal
  tenantId?: string
}

export type TenantRecord = {
  id: string
  name: string
  slug: string
  status: 'trial' | 'active' | 'suspended' | 'cancelled'
  plan: string
  databaseName: string
  primaryDomain: string
}

export type TenantStatus = TenantRecord['status']

export type SubscriptionPlanRecord = {
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

export type UpsertSubscriptionPlanInput = {
  code: string
  name: string
  monthlyPricePkr: number
  maxBranches?: number | null
  maxMembers?: number | null
  whatsappEnabled?: boolean
  smsEnabled?: boolean
  advancedReportsEnabled?: boolean
  isActive?: boolean
}

export type TenantStatsRecord = {
  tenantId: string
  activeMembers: number
  suspendedMembers: number
  monthlyRevenuePkr: number
  outstandingDuesPkr: number
  renewalDueCount: number
}

export type BillingInvoiceStatus = 'issued' | 'paid' | 'overdue' | 'void'

export type BillingInvoiceRecord = {
  id: string
  invoiceNumber: string
  tenantId: string
  tenantName: string
  planName: string
  amountPkr: number
  status: BillingInvoiceStatus
  periodStart: string
  periodEnd: string
  dueDate: string
  paidAt: string | null
  provider: 'manual' | 'external_stub'
  providerReference: string | null
  createdAt: string
}

export type CreateBillingInvoiceInput = {
  tenantId: string
  periodStart?: string
  periodEnd?: string
  dueDate?: string
}

export type BillingSummaryRecord = {
  mrrPkr: number
  issuedPkr: number
  paidPkr: number
  overduePkr: number
  openInvoiceCount: number
}

export type UpdateTenantStatusInput = {
  status: TenantStatus
}

export type UpdateTenantPlanInput = {
  planCode: string
}

export type ProvisionTenantInput = {
  name: string
  slug: string
  planCode?: string
  databaseName?: string
  primaryDomain?: string
  adminName: string
  adminEmail: string
  city?: string
  branchName?: string
}

export type ProvisioningJobRecord = {
  id: string
  tenantId: string
  requestedBy: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  step: string
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export type ProvisionTenantResult = {
  tenant: TenantRecord
  job: ProvisioningJobRecord
}

export type MemberStatus = 'active' | 'balance_due' | 'dues_pending' | 'suspended' | 'cancelled'

export type MemberRecord = {
  id: string
  memberCode: string
  name: string
  phone: string
  branchId: string
  branchName: string
  planId: string
  planName: string
  status: MemberStatus
  currentBalancePkr: number
  dueDate: string
  lastPaymentDate: string
}

export type CreateMemberInput = {
  name: string
  phone: string
  branchId?: string
  branchName?: string
  planId?: string
  planName?: string
  dueDate?: string
}

export type UpdateMemberInput = Partial<CreateMemberInput> & {
  status?: MemberStatus
}

export type PaymentMethod = 'cash' | 'easypaisa' | 'jazzcash' | 'card' | 'bank_transfer'

export type PaymentRecord = {
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

export type NotificationChannel = 'whatsapp' | 'sms' | 'email'

export type NotificationRecord = {
  id: string
  memberId: string
  templateId: string | null
  triggerCode: string
  channel: NotificationChannel
  status: 'queued' | 'sent' | 'delivered' | 'failed'
  providerMessageId: string | null
  failureReason: string | null
  createdAt: string
}

export type NotificationLogRecord = NotificationRecord & {
  memberName: string
}

export type SendReminderInput = {
  memberId: string
  triggerCode?: string
  channel?: NotificationChannel
}

export type CreatePaymentInput = {
  memberId: string
  amountPaidPkr: number
  discountPkr?: number
  lateFeePkr?: number
  method: PaymentMethod
  transactionId?: string
}

export type RenewalStatus = 'scheduled' | 'reminder_queued' | 'paid' | 'overdue'

export type RenewalQueueItem = {
  memberId: string
  memberName: string
  memberCode: string
  planName: string
  branchName: string
  dueDate: string
  amountPkr: number
  memberStatus: MemberStatus
  renewalStatus: RenewalStatus
  recommendedAction: string
}

export type RenewalAction = 'paid' | 'overdue' | 'reminder_queued'

export type RenewalActionInput = {
  action: RenewalAction
  channel?: NotificationChannel
}

export type BranchRecord = {
  id: string
  name: string
  city: string
  address: string | null
  isActive: boolean
}

export type MembershipPlanRecord = {
  id: string
  name: string
  billingCycle: 'monthly' | 'quarterly' | 'annual'
  pricePkr: number
  graceDays: number
  isActive: boolean
}

export type UpsertBranchInput = {
  name: string
  city: string
  address?: string | null
  isActive?: boolean
}

export type UpsertMembershipPlanInput = {
  name: string
  billingCycle: MembershipPlanRecord['billingCycle']
  pricePkr: number
  graceDays?: number
  isActive?: boolean
}

export type TenantSettingsRecord = {
  branches: BranchRecord[]
  membershipPlans: MembershipPlanRecord[]
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
  paymentMethodBreakdown: Array<{
    method: PaymentMethod
    amountPkr: number
  }>
}

export type AuditScope = 'tenant' | 'platform'

export type AuditLogRecord = {
  id: string
  scope: AuditScope
  tenantId: string | null
  actorUserId: string
  actorName: string
  action: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type CreateAuditLogInput = {
  actorUserId: string
  actorName: string
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}

export type TenantStore = {
  members: MemberRecord[]
  payments: PaymentRecord[]
  notificationLogs?: NotificationRecord[]
  branches?: BranchRecord[]
  membershipPlans?: MembershipPlanRecord[]
  auditLogs?: AuditLogRecord[]
}

export type ApiSuccess<T> = {
  ok: true
  data: T
}

export type ApiFailure = {
  ok: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
