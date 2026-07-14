import { randomUUID } from 'node:crypto'
import { readState, writeState } from './fileStore.js'
import type { RepositoryProvider } from './contracts.js'
import type {
  AuditLogRecord,
  BillingInvoiceRecord,
  BranchRecord,
  CreateAuditLogInput,
  MemberRecord,
  MembershipPlanRecord,
  NotificationRecord,
  PaymentMethod,
  ProvisioningJobRecord,
  RenewalQueueItem,
  SubscriptionPlanRecord,
  TenantRecord,
  TenantStatsRecord,
  UpsertBranchInput,
  UpsertMembershipPlanInput,
} from '../types.js'

function createTenantRecord(input: {
  id: string
  name: string
  slug: string
  plan: string
  databaseName: string
  primaryDomain: string
}): TenantRecord {
  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    status: 'trial',
    plan: input.plan,
    databaseName: input.databaseName,
    primaryDomain: input.primaryDomain,
  }
}

function planPrice(planName: string) {
  if (planName.includes('Annual')) return 12000
  if (planName.includes('Quarterly')) return 9000
  if (planName.includes('Pro')) return 4500
  return 3500
}

function planPriceFromStore(plans: MembershipPlanRecord[] | undefined, planName: string) {
  return plans?.find((plan) => plan.name === planName)?.pricePkr ?? planPrice(planName)
}

function nextMemberCode(members: MemberRecord[]) {
  const nextNumber = members.length + 284
  return `GF-2026-${String(nextNumber).padStart(5, '0')}`
}

function normalizePlanCode(planCode: string) {
  return planCode.toLowerCase().trim().replaceAll(' ', '-')
}

function findSubscriptionPlan(plans: SubscriptionPlanRecord[], codeOrName: string) {
  const normalized = normalizePlanCode(codeOrName)
  return plans.find((plan) => plan.code === normalized || normalizePlanCode(plan.name) === normalized) ?? null
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function nextInvoiceNumber(invoices: BillingInvoiceRecord[]) {
  const year = new Date().getFullYear()
  const nextNumber = invoices.length + 1
  return `INV-${year}-${String(nextNumber).padStart(5, '0')}`
}

function invoiceStatus(invoice: BillingInvoiceRecord): BillingInvoiceRecord['status'] {
  if (invoice.status === 'paid' || invoice.status === 'void') return invoice.status
  return invoice.dueDate < isoDate(new Date()) ? 'overdue' : invoice.status
}

function planPriceForTenant(tenant: TenantRecord, plans: SubscriptionPlanRecord[]) {
  const plan = findSubscriptionPlan(plans, tenant.plan)
  return plan?.monthlyPricePkr ?? 0
}

function renewalStatusFor(member: MemberRecord) {
  if (member.status === 'dues_pending' || member.status === 'suspended') return 'overdue' as const
  if (member.status === 'balance_due') return 'reminder_queued' as const
  return 'scheduled' as const
}

function recommendedActionFor(member: MemberRecord) {
  if (member.status === 'dues_pending' || member.status === 'suspended') return 'Send due reminder'
  if (member.status === 'balance_due') return 'Collect balance'
  return 'Schedule reminder'
}

function mapRenewalItem(member: MemberRecord, plans: MembershipPlanRecord[] | undefined): RenewalQueueItem {
  return {
    memberId: member.id,
    memberName: member.name,
    memberCode: member.memberCode,
    planName: member.planName,
    branchName: member.branchName,
    dueDate: member.dueDate,
    amountPkr: member.currentBalancePkr || planPriceFromStore(plans, member.planName),
    memberStatus: member.status,
    renewalStatus: renewalStatusFor(member),
    recommendedAction: recommendedActionFor(member),
  }
}

function defaultStaffAccess() {
  return [
    {
      role: 'tenant-admin' as const,
      label: 'Tenant Admin',
      canManageMembers: true,
      canRecordPayments: true,
      canManageSettings: true,
    },
    {
      role: 'staff' as const,
      label: 'Front Desk Staff',
      canManageMembers: true,
      canRecordPayments: true,
      canManageSettings: false,
    },
  ]
}

function upsertBranch(existing: BranchRecord | undefined, input: UpsertBranchInput | Partial<UpsertBranchInput>): BranchRecord {
  return {
    id: existing?.id ?? randomUUID(),
    name: input.name?.trim() || existing?.name || 'New Branch',
    city: input.city?.trim() || existing?.city || 'Karachi',
    address: input.address ?? existing?.address ?? null,
    isActive: input.isActive ?? existing?.isActive ?? true,
  }
}

function upsertMembershipPlan(
  existing: MembershipPlanRecord | undefined,
  input: UpsertMembershipPlanInput | Partial<UpsertMembershipPlanInput>,
): MembershipPlanRecord {
  return {
    id: existing?.id ?? randomUUID(),
    name: input.name?.trim() || existing?.name || 'New Plan',
    billingCycle: input.billingCycle ?? existing?.billingCycle ?? 'monthly',
    pricePkr: input.pricePkr ?? existing?.pricePkr ?? 3500,
    graceDays: input.graceDays ?? existing?.graceDays ?? 3,
    isActive: input.isActive ?? existing?.isActive ?? true,
  }
}

function calculateTenantStats(tenantId: string): TenantStatsRecord {
  const store = readState().tenantStores[tenantId]
  const monthKey = new Date().toISOString().slice(0, 7)
  return {
    tenantId,
    activeMembers: store?.members.filter((member) => member.status === 'active' || member.status === 'balance_due').length ?? 0,
    suspendedMembers: store?.members.filter((member) => member.status === 'suspended' || member.status === 'cancelled').length ?? 0,
    monthlyRevenuePkr: store?.payments
      .filter((payment) => payment.collectedAt.slice(0, 7) === monthKey)
      .reduce((sum, payment) => sum + payment.amountPaidPkr, 0) ?? 0,
    outstandingDuesPkr: store?.members.reduce((sum, member) => sum + member.currentBalancePkr, 0) ?? 0,
    renewalDueCount: store?.members.filter((member) => member.status !== 'cancelled').length ?? 0,
  }
}

function createAuditLog(
  scope: AuditLogRecord['scope'],
  tenantId: string | null,
  input: CreateAuditLogInput,
): AuditLogRecord {
  return {
    id: randomUUID(),
    scope,
    tenantId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString(),
  }
}

export function createFileRepositories(): RepositoryProvider {
  return {
    auth: {
      findUserByEmail(email) {
        const state = readState()
        return state.central.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null
      },
    },
    platform: {
      listTenants() {
        return readState().central.tenants
      },
      findTenantById(tenantId) {
        return readState().central.tenants.find((tenant) => tenant.id === tenantId) ?? null
      },
      findTenantBySlug(slug) {
        return readState().central.tenants.find((tenant) => tenant.slug === slug) ?? null
      },
      provisionTenant(input, requestedBy) {
        const state = readState()
        const slug = input.slug.toLowerCase()
        if (state.central.tenants.some((tenant) => tenant.slug === slug)) {
          throw new Error('Tenant slug already exists.')
        }

        const tenant = createTenantRecord({
          id: `tenant_${slug.replaceAll('-', '_')}`,
          name: input.name,
          slug,
          plan: input.planCode === 'professional' ? 'Professional' : 'Growth',
          databaseName: input.databaseName ?? `tenant_${slug.replaceAll('-', '_')}`,
          primaryDomain: input.primaryDomain ?? `${slug}.gymflow.pk`,
        })
        const job: ProvisioningJobRecord = {
          id: randomUUID(),
          tenantId: tenant.id,
          requestedBy: requestedBy.id,
          status: 'completed',
          step: 'file_store_provisioned',
          errorMessage: null,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }

        state.central.tenants.push(tenant)
        state.central.users.push({
          id: `usr_${slug.replaceAll('-', '_')}_admin`,
          name: input.adminName,
          email: input.adminEmail,
          role: 'tenant-admin',
          portal: 'tenant',
          tenantId: tenant.id,
        })
        state.tenantStores[tenant.id] = {
          members: [],
          payments: [],
          branches: [
            {
              id: randomUUID(),
              name: input.branchName || 'Main Branch',
              city: input.city || 'Karachi',
              address: null,
              isActive: true,
            },
          ],
          membershipPlans: [
            { id: randomUUID(), name: 'Monthly Basic', billingCycle: 'monthly', pricePkr: 3500, graceDays: 3, isActive: true },
            { id: randomUUID(), name: 'Monthly Pro', billingCycle: 'monthly', pricePkr: 4500, graceDays: 3, isActive: true },
            { id: randomUUID(), name: 'Quarterly Elite', billingCycle: 'quarterly', pricePkr: 9000, graceDays: 5, isActive: true },
            { id: randomUUID(), name: 'Annual Elite', billingCycle: 'annual', pricePkr: 12000, graceDays: 7, isActive: true },
          ],
        }
        writeState(state)
        return { tenant, job }
      },
      updateTenantStatus(tenantId, status) {
        const state = readState()
        const tenant = state.central.tenants.find((currentTenant) => currentTenant.id === tenantId)
        if (!tenant) return null

        const updatedTenant = {
          ...tenant,
          status,
        }
        state.central.tenants = state.central.tenants.map((currentTenant) =>
          currentTenant.id === tenantId ? updatedTenant : currentTenant,
        )
        writeState(state)
        return updatedTenant
      },
      listSubscriptionPlans() {
        return readState().central.subscriptionPlans
      },
      upsertSubscriptionPlan(input) {
        const state = readState()
        const code = normalizePlanCode(input.code)
        const currentPlan = state.central.subscriptionPlans.find((plan) => plan.code === code)
        const plan: SubscriptionPlanRecord = {
          id: currentPlan?.id ?? `sub_${code.replaceAll('-', '_')}`,
          code,
          name: input.name.trim(),
          monthlyPricePkr: input.monthlyPricePkr,
          maxBranches: input.maxBranches ?? null,
          maxMembers: input.maxMembers ?? null,
          whatsappEnabled: input.whatsappEnabled ?? true,
          smsEnabled: input.smsEnabled ?? true,
          advancedReportsEnabled: input.advancedReportsEnabled ?? false,
          isActive: input.isActive ?? true,
        }
        state.central.subscriptionPlans = currentPlan
          ? state.central.subscriptionPlans.map((current) => current.code === code ? plan : current)
          : [plan, ...state.central.subscriptionPlans]
        writeState(state)
        return plan
      },
      updateTenantPlan(tenantId, input) {
        const state = readState()
        const tenant = state.central.tenants.find((currentTenant) => currentTenant.id === tenantId)
        const plan = findSubscriptionPlan(state.central.subscriptionPlans, input.planCode)
        if (!tenant || !plan) return null

        const updatedTenant = {
          ...tenant,
          plan: plan.name,
        }
        state.central.tenants = state.central.tenants.map((currentTenant) =>
          currentTenant.id === tenantId ? updatedTenant : currentTenant,
        )
        writeState(state)
        return updatedTenant
      },
      listTenantStats() {
        return readState().central.tenants.map((tenant) => calculateTenantStats(tenant.id))
      },
    },
    members: {
      listMembers(tenantId) {
        return readState().tenantStores[tenantId]?.members ?? null
      },
      findMember(tenantId, memberId) {
        return readState().tenantStores[tenantId]?.members.find((member) => member.id === memberId) ?? null
      },
      createMember(tenantId, input) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        if (!tenantStore) return null

        const planName = input.planName ?? 'Monthly Basic'
        const member: MemberRecord = {
          id: randomUUID(),
          memberCode: nextMemberCode(tenantStore.members),
          name: input.name.trim(),
          phone: input.phone.trim(),
          branchId: input.branchId ?? 'br_main',
          branchName: input.branchName ?? 'Main Branch',
          planId: input.planId ?? 'plan_monthly_basic',
          planName,
          status: 'active',
          currentBalancePkr: planPriceFromStore(tenantStore.membershipPlans, planName),
          dueDate: input.dueDate ?? new Date().toISOString().slice(0, 10),
          lastPaymentDate: '',
        }

        tenantStore.members.push(member)
        writeState(state)
        return member
      },
      updateMemberProfile(tenantId, memberId, input) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        if (!tenantStore) return null

        const currentMember = tenantStore.members.find((member) => member.id === memberId)
        if (!currentMember) return null

        const updatedMember: MemberRecord = {
          ...currentMember,
          name: input.name?.trim() || currentMember.name,
          phone: input.phone?.trim() || currentMember.phone,
          branchId: input.branchId ?? currentMember.branchId,
          branchName: input.branchName ?? currentMember.branchName,
          planId: input.planId ?? currentMember.planId,
          planName: input.planName ?? currentMember.planName,
          dueDate: input.dueDate ?? currentMember.dueDate,
          status: input.status ?? currentMember.status,
        }

        tenantStore.members = tenantStore.members.map((member) =>
          member.id === memberId ? updatedMember : member,
        )
        writeState(state)
        return updatedMember
      },
      updateMember(tenantId, updatedMember) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        if (!tenantStore) return null

        tenantStore.members = tenantStore.members.map((member) =>
          member.id === updatedMember.id ? updatedMember : member,
        )
        writeState(state)
        return updatedMember
      },
    },
    payments: {
      listPayments(tenantId) {
        return readState().tenantStores[tenantId]?.payments ?? null
      },
      createPayment(tenantId, payment, updatedMember) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        if (!tenantStore) return null

        tenantStore.payments.push(payment)
        tenantStore.members = tenantStore.members.map((member) =>
          member.id === updatedMember.id ? updatedMember : member,
        )
        writeState(state)
        return { payment, member: updatedMember }
      },
      nextReceiptNumber(tenantId) {
        const payments = readState().tenantStores[tenantId]?.payments ?? []
        return String(payments.length + 144).padStart(5, '0')
      },
    },
    notifications: {
      listLogs(tenantId) {
        const tenantStore = readState().tenantStores[tenantId]
        if (!tenantStore) return null

        return (tenantStore.notificationLogs ?? []).map((notification) => ({
          ...notification,
          memberName: tenantStore.members.find((member) => member.id === notification.memberId)?.name ?? 'Unknown member',
        }))
      },
      sendReminder(tenantId, input) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        if (!tenantStore) return null

        const member = tenantStore.members.find((currentMember) => currentMember.id === input.memberId)
        if (!member) return null

        const notification: NotificationRecord = {
          id: randomUUID(),
          memberId: member.id,
          templateId: null,
          triggerCode: input.triggerCode,
          channel: input.channel,
          status: 'queued',
          providerMessageId: null,
          failureReason: null,
          createdAt: new Date().toISOString(),
        }
        tenantStore.notificationLogs ??= []
        tenantStore.notificationLogs.unshift(notification)
        writeState(state)
        return notification
      },
      retryNotification(tenantId, notificationId) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        if (!tenantStore) return null

        const notification = tenantStore.notificationLogs?.find((log) => log.id === notificationId)
        if (!notification) return null

        const retriedNotification: NotificationRecord = {
          ...notification,
          id: randomUUID(),
          status: 'queued',
          providerMessageId: null,
          failureReason: null,
          createdAt: new Date().toISOString(),
        }
        tenantStore.notificationLogs ??= []
        tenantStore.notificationLogs.unshift(retriedNotification)
        writeState(state)
        return retriedNotification
      },
    },
    renewals: {
      listRenewalQueue(tenantId) {
        const tenantStore = readState().tenantStores[tenantId]
        if (!tenantStore) return null

        return tenantStore.members
          .filter((member) => member.status !== 'cancelled')
          .map((member) => mapRenewalItem(member, tenantStore.membershipPlans))
          .sort((first, second) => first.dueDate.localeCompare(second.dueDate))
      },
      updateRenewalStatus(tenantId, memberId, action) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        const member = tenantStore?.members.find((currentMember) => currentMember.id === memberId)
        if (!tenantStore || !member) return null

        const updatedMember: MemberRecord = {
          ...member,
          status: action === 'paid' ? 'active' : action === 'overdue' ? 'dues_pending' : 'balance_due',
          currentBalancePkr: action === 'paid' ? 0 : member.currentBalancePkr || planPriceFromStore(tenantStore.membershipPlans, member.planName),
          lastPaymentDate: action === 'paid' ? new Date().toISOString().slice(0, 10) : member.lastPaymentDate,
        }
        tenantStore.members = tenantStore.members.map((currentMember) =>
          currentMember.id === memberId ? updatedMember : currentMember,
        )
        writeState(state)
        return mapRenewalItem(updatedMember, tenantStore.membershipPlans)
      },
    },
    settings: {
      getTenantSettings(tenantId) {
        const tenantStore = readState().tenantStores[tenantId]
        if (!tenantStore) return null

        return {
          branches: tenantStore.branches ?? [],
          membershipPlans: tenantStore.membershipPlans ?? [],
          staffAccess: defaultStaffAccess(),
        }
      },
      createBranch(tenantId, input) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        if (!tenantStore) return null

        const branch = upsertBranch(undefined, input)
        tenantStore.branches ??= []
        tenantStore.branches.unshift(branch)
        writeState(state)
        return branch
      },
      updateBranch(tenantId, branchId, input) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        const existingBranch = tenantStore?.branches?.find((branch) => branch.id === branchId)
        if (!tenantStore || !existingBranch) return null

        const branch = upsertBranch(existingBranch, input)
        tenantStore.branches = (tenantStore.branches ?? []).map((currentBranch) =>
          currentBranch.id === branchId ? branch : currentBranch,
        )
        writeState(state)
        return branch
      },
      createMembershipPlan(tenantId, input) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        if (!tenantStore) return null

        const plan = upsertMembershipPlan(undefined, input)
        tenantStore.membershipPlans ??= []
        tenantStore.membershipPlans.unshift(plan)
        writeState(state)
        return plan
      },
      updateMembershipPlan(tenantId, planId, input) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        const existingPlan = tenantStore?.membershipPlans?.find((plan) => plan.id === planId)
        if (!tenantStore || !existingPlan) return null

        const plan = upsertMembershipPlan(existingPlan, input)
        tenantStore.membershipPlans = (tenantStore.membershipPlans ?? []).map((currentPlan) =>
          currentPlan.id === planId ? plan : currentPlan,
        )
        writeState(state)
        return plan
      },
    },
    reports: {
      getTenantReportSummary(tenantId) {
        const tenantStore = readState().tenantStores[tenantId]
        if (!tenantStore) return null

        const paymentMethodBreakdown = tenantStore.payments.reduce<Array<{ method: PaymentMethod; amountPkr: number }>>(
          (breakdown, payment) => {
            const existing = breakdown.find((item) => item.method === payment.method)
            if (existing) existing.amountPkr += payment.amountPaidPkr
            else breakdown.push({ method: payment.method, amountPkr: payment.amountPaidPkr })
            return breakdown
          },
          [],
        )

        return {
          collectionsPkr: tenantStore.payments.reduce((sum, payment) => sum + payment.amountPaidPkr, 0),
          outstandingDuesPkr: tenantStore.members.reduce((sum, member) => sum + member.currentBalancePkr, 0),
          renewalDueCount: tenantStore.members.filter((member) => member.status !== 'cancelled').length,
          activeMembers: tenantStore.members.filter((member) => member.status === 'active' || member.status === 'balance_due').length,
          suspendedMembers: tenantStore.members.filter((member) => member.status === 'suspended' || member.status === 'cancelled').length,
          paymentMethodBreakdown,
        }
      },
    },
    billing: {
      listInvoices() {
        return (readState().central.billingInvoices ?? []).map((invoice) => ({
          ...invoice,
          status: invoiceStatus(invoice),
        }))
      },
      getSummary() {
        const state = readState()
        const invoices = (state.central.billingInvoices ?? []).map((invoice) => ({
          ...invoice,
          status: invoiceStatus(invoice),
        }))
        return {
          mrrPkr: state.central.tenants
            .filter((tenant) => tenant.status !== 'cancelled')
            .reduce((sum, tenant) => sum + planPriceForTenant(tenant, state.central.subscriptionPlans), 0),
          issuedPkr: invoices
            .filter((invoice) => invoice.status === 'issued' || invoice.status === 'overdue')
            .reduce((sum, invoice) => sum + invoice.amountPkr, 0),
          paidPkr: invoices
            .filter((invoice) => invoice.status === 'paid')
            .reduce((sum, invoice) => sum + invoice.amountPkr, 0),
          overduePkr: invoices
            .filter((invoice) => invoice.status === 'overdue')
            .reduce((sum, invoice) => sum + invoice.amountPkr, 0),
          openInvoiceCount: invoices.filter((invoice) => invoice.status === 'issued' || invoice.status === 'overdue').length,
        }
      },
      createInvoice(input) {
        const state = readState()
        const tenant = state.central.tenants.find((currentTenant) => currentTenant.id === input.tenantId)
        if (!tenant) return null

        const now = new Date()
        const periodStart = input.periodStart ?? isoDate(new Date(now.getFullYear(), now.getMonth(), 1))
        const periodEnd = input.periodEnd ?? isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
        const invoice: BillingInvoiceRecord = {
          id: randomUUID(),
          invoiceNumber: nextInvoiceNumber(state.central.billingInvoices ?? []),
          tenantId: tenant.id,
          tenantName: tenant.name,
          planName: tenant.plan,
          amountPkr: planPriceForTenant(tenant, state.central.subscriptionPlans),
          status: 'issued',
          periodStart,
          periodEnd,
          dueDate: input.dueDate ?? isoDate(addDays(now, 7)),
          paidAt: null,
          provider: 'manual',
          providerReference: null,
          createdAt: now.toISOString(),
        }
        state.central.billingInvoices ??= []
        state.central.billingInvoices.unshift(invoice)
        writeState(state)
        return invoice
      },
      markInvoicePaid(invoiceId) {
        const state = readState()
        const invoice = state.central.billingInvoices?.find((currentInvoice) => currentInvoice.id === invoiceId)
        if (!invoice) return null

        const paidInvoice: BillingInvoiceRecord = {
          ...invoice,
          status: 'paid',
          paidAt: new Date().toISOString(),
          provider: 'external_stub',
          providerReference: `GF-PAY-${Date.now()}`,
        }
        state.central.billingInvoices = (state.central.billingInvoices ?? []).map((currentInvoice) =>
          currentInvoice.id === invoiceId ? paidInvoice : currentInvoice,
        )
        writeState(state)
        return paidInvoice
      },
    },
    audit: {
      listTenantAuditLogs(tenantId) {
        return readState().tenantStores[tenantId]?.auditLogs ?? null
      },
      recordTenantAuditLog(tenantId, input) {
        const state = readState()
        const tenantStore = state.tenantStores[tenantId]
        if (!tenantStore) return null

        const auditLog = createAuditLog('tenant', tenantId, input)
        tenantStore.auditLogs ??= []
        tenantStore.auditLogs.unshift(auditLog)
        writeState(state)
        return auditLog
      },
      listPlatformAuditLogs() {
        return readState().central.platformAuditLogs ?? []
      },
      recordPlatformAuditLog(input) {
        const state = readState()
        const auditLog = createAuditLog('platform', null, input)
        state.central.platformAuditLogs ??= []
        state.central.platformAuditLogs.unshift(auditLog)
        writeState(state)
        return auditLog
      },
    },
  }
}
