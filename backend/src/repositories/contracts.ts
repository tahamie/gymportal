import type {
  AuditLogRecord,
  BillingInvoiceRecord,
  BillingSummaryRecord,
  BranchRecord,
  CreateBillingInvoiceInput,
  CreateAuditLogInput,
  MembershipPlanRecord,
  MemberRecord,
  NotificationLogRecord,
  NotificationRecord,
  PaymentRecord,
  Portal,
  CreateMemberInput,
  ProvisionTenantInput,
  ProvisionTenantResult,
  RenewalAction,
  RenewalQueueItem,
  SubscriptionPlanRecord,
  TenantRecord,
  TenantReportSummary,
  TenantSettingsRecord,
  TenantStatsRecord,
  TenantStatus,
  UpdateTenantPlanInput,
  UpdateMemberInput,
  UpsertBranchInput,
  UpsertMembershipPlanInput,
  UpsertSubscriptionPlanInput,
  UserSession,
} from '../types.js'

export type RepositoryResult<T> = T | Promise<T>

export type AuthRepository = {
  findUserByEmail(
    email: string,
    options?: {
      portal?: Portal
      tenant?: TenantRecord | null
    },
  ): RepositoryResult<UserSession | null>
}

export type PlatformRepository = {
  listTenants(): RepositoryResult<TenantRecord[]>
  findTenantById(tenantId: string): RepositoryResult<TenantRecord | null>
  findTenantBySlug(slug: string): RepositoryResult<TenantRecord | null>
  provisionTenant(input: ProvisionTenantInput, requestedBy: UserSession): RepositoryResult<ProvisionTenantResult>
  updateTenantStatus(tenantId: string, status: TenantStatus): RepositoryResult<TenantRecord | null>
  listSubscriptionPlans(): RepositoryResult<SubscriptionPlanRecord[]>
  upsertSubscriptionPlan(input: UpsertSubscriptionPlanInput): RepositoryResult<SubscriptionPlanRecord>
  updateTenantPlan(tenantId: string, input: UpdateTenantPlanInput): RepositoryResult<TenantRecord | null>
  listTenantStats(): RepositoryResult<TenantStatsRecord[]>
}

export type MembersRepository = {
  listMembers(tenantId: string): RepositoryResult<MemberRecord[] | null>
  findMember(tenantId: string, memberId: string): RepositoryResult<MemberRecord | null>
  createMember(tenantId: string, input: CreateMemberInput): RepositoryResult<MemberRecord | null>
  updateMemberProfile(tenantId: string, memberId: string, input: UpdateMemberInput): RepositoryResult<MemberRecord | null>
  updateMember(tenantId: string, updatedMember: MemberRecord): RepositoryResult<MemberRecord | null>
}

export type PaymentsRepository = {
  listPayments(tenantId: string): RepositoryResult<PaymentRecord[] | null>
  createPayment(
    tenantId: string,
    payment: PaymentRecord,
    updatedMember: MemberRecord,
  ): RepositoryResult<{ payment: PaymentRecord; member: MemberRecord } | null>
  nextReceiptNumber(tenantId: string): RepositoryResult<string>
}

export type NotificationsRepository = {
  listLogs(tenantId: string): RepositoryResult<NotificationLogRecord[] | null>
  sendReminder(
    tenantId: string,
    input: {
      memberId: string
      triggerCode: string
      channel: 'whatsapp' | 'sms' | 'email'
    },
  ): RepositoryResult<NotificationRecord | null>
  retryNotification(tenantId: string, notificationId: string): RepositoryResult<NotificationRecord | null>
}

export type RenewalsRepository = {
  listRenewalQueue(tenantId: string): RepositoryResult<RenewalQueueItem[] | null>
  updateRenewalStatus(
    tenantId: string,
    memberId: string,
    action: RenewalAction,
  ): RepositoryResult<RenewalQueueItem | null>
}

export type SettingsRepository = {
  getTenantSettings(tenantId: string): RepositoryResult<TenantSettingsRecord | null>
  createBranch(tenantId: string, input: UpsertBranchInput): RepositoryResult<BranchRecord | null>
  updateBranch(tenantId: string, branchId: string, input: Partial<UpsertBranchInput>): RepositoryResult<BranchRecord | null>
  createMembershipPlan(tenantId: string, input: UpsertMembershipPlanInput): RepositoryResult<MembershipPlanRecord | null>
  updateMembershipPlan(
    tenantId: string,
    planId: string,
    input: Partial<UpsertMembershipPlanInput>,
  ): RepositoryResult<MembershipPlanRecord | null>
}

export type ReportsRepository = {
  getTenantReportSummary(tenantId: string): RepositoryResult<TenantReportSummary | null>
}

export type AuditRepository = {
  listTenantAuditLogs(tenantId: string): RepositoryResult<AuditLogRecord[] | null>
  recordTenantAuditLog(tenantId: string, input: CreateAuditLogInput): RepositoryResult<AuditLogRecord | null>
  listPlatformAuditLogs(): RepositoryResult<AuditLogRecord[]>
  recordPlatformAuditLog(input: CreateAuditLogInput): RepositoryResult<AuditLogRecord>
}

export type BillingRepository = {
  listInvoices(): RepositoryResult<BillingInvoiceRecord[]>
  getSummary(): RepositoryResult<BillingSummaryRecord>
  createInvoice(input: CreateBillingInvoiceInput): RepositoryResult<BillingInvoiceRecord | null>
  markInvoicePaid(invoiceId: string): RepositoryResult<BillingInvoiceRecord | null>
}

export type RepositoryProvider = {
  auth: AuthRepository
  platform: PlatformRepository
  members: MembersRepository
  payments: PaymentsRepository
  notifications: NotificationsRepository
  renewals: RenewalsRepository
  settings: SettingsRepository
  reports: ReportsRepository
  audit: AuditRepository
  billing: BillingRepository
}

export type RepositoryMode = 'file' | 'postgres'

export function getRepositoryMode(value = process.env.GYMFLOW_REPOSITORY): RepositoryMode {
  const mode = (value ?? 'file').toLowerCase()
  if (mode === 'file' || mode === 'postgres') return mode
  throw new Error(`Unsupported GYMFLOW_REPOSITORY mode: ${value}`)
}
