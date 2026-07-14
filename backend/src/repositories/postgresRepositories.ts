import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pool, type QueryResultRow } from 'pg'
import {
  getAdminPool,
  getCentralPool,
  getTenantConnectionString,
  getTenantPool,
  withTenantTransaction,
} from './postgresConnection.js'
import { centralSql, tenantSql } from './postgresSql.js'
import type { RepositoryProvider } from './contracts.js'
import type {
  AuditLogRecord,
  BillingInvoiceRecord,
  BillingSummaryRecord,
  BranchRecord,
  MembershipPlanRecord,
  MemberRecord,
  MemberStatus,
  NotificationChannel,
  NotificationLogRecord,
  NotificationRecord,
  PaymentMethod,
  PaymentRecord,
  ProvisionTenantInput,
  ProvisioningJobRecord,
  RenewalAction,
  RenewalQueueItem,
  SubscriptionPlanRecord,
  TenantRecord,
  TenantReportSummary,
  TenantSettingsRecord,
  TenantStatsRecord,
  UpsertBranchInput,
  UpsertMembershipPlanInput,
  UserSession,
} from '../types.js'

export function createPostgresRepositories(): RepositoryProvider {
  async function findTenantById(tenantId: string) {
    const result = await getCentralPool().query(centralSql.findTenantById, [tenantId])
    return result.rows[0] ? mapTenant(result.rows[0]) : null
  }

  async function findTenantBySlug(slug: string) {
    const result = await getCentralPool().query(centralSql.findTenantBySlug, [slug])
    return result.rows[0] ? mapTenant(result.rows[0]) : null
  }

  async function requireTenant(tenantId: string) {
    return findTenantById(tenantId)
  }

  return {
    auth: {
      async findUserByEmail(email, options) {
        if (options?.portal === 'tenant') {
          if (!options.tenant) return null
          const result = await getTenantPool(options.tenant).query(tenantSql.findTenantUserByEmail, [email])
          return result.rows[0] ? mapTenantUser(result.rows[0], options.tenant) : null
        }

        const result = await getCentralPool().query(centralSql.findUserByEmail, [email])
        return result.rows[0] ? mapPlatformUser(result.rows[0]) : null
      },
    },
    platform: {
      async listTenants() {
        const result = await getCentralPool().query(centralSql.listTenants)
        return result.rows.map(mapTenant)
      },
      findTenantById,
      findTenantBySlug,
      async provisionTenant(input, requestedBy) {
        const normalizedInput = normalizeProvisionTenantInput(input)
        const planResult = await getCentralPool().query(centralSql.findPlanByCode, [normalizedInput.planCode])
        const plan = planResult.rows[0]
        if (!plan) {
          throw new Error(`Subscription plan was not found: ${normalizedInput.planCode}`)
        }

        const tenantId = randomUUID()
        const createTenantResult = await getCentralPool().query(centralSql.createTenant, [
          tenantId,
          normalizedInput.name,
          normalizedInput.slug,
          readString(plan, 'id'),
          normalizedInput.databaseName,
          normalizedInput.primaryDomain,
          readString(plan, 'name'),
        ])
        const tenant = mapTenant(createTenantResult.rows[0])
        const job = await createProvisioningJob(tenant, requestedBy, 'tenant_created')

        try {
          await ensureTenantDatabase(tenant.databaseName)
          await updateProvisioningJob(job.id, 'running', 'database_created', null)
          await applyTenantSchema(tenant.databaseName)
          await updateProvisioningJob(job.id, 'running', 'schema_applied', null)
          await seedTenantDefaults(tenant, normalizedInput)
          const completedJob = await updateProvisioningJob(job.id, 'completed', 'tenant_ready', null)
          return { tenant, job: completedJob }
        } catch (error) {
          const failedJob = await updateProvisioningJob(
            job.id,
            'failed',
            'provisioning_failed',
            error instanceof Error ? error.message : String(error),
          )
          return { tenant, job: failedJob }
        }
      },
      async updateTenantStatus(tenantId, status) {
        const result = await getCentralPool().query(centralSql.updateTenantStatus, [tenantId, status])
        return result.rows[0] ? mapTenant(result.rows[0]) : null
      },
      async listSubscriptionPlans() {
        const result = await getCentralPool().query(centralSql.listPlans)
        return result.rows.map(mapSubscriptionPlan)
      },
      async upsertSubscriptionPlan(input) {
        const result = await getCentralPool().query(centralSql.upsertPlan, [
          randomUUID(),
          normalizePlanCode(input.code),
          input.name.trim(),
          input.monthlyPricePkr,
          input.maxBranches ?? null,
          input.maxMembers ?? null,
          input.whatsappEnabled ?? true,
          input.smsEnabled ?? true,
          input.advancedReportsEnabled ?? false,
          input.isActive ?? true,
        ])
        return mapSubscriptionPlan(result.rows[0])
      },
      async updateTenantPlan(tenantId, input) {
        const planResult = await getCentralPool().query(centralSql.findPlanByCode, [normalizePlanCode(input.planCode)])
        const plan = planResult.rows[0]
        if (!plan) return null

        const result = await getCentralPool().query(centralSql.updateTenantPlan, [tenantId, readString(plan, 'id')])
        return result.rows[0] ? mapTenant(result.rows[0]) : null
      },
      async listTenantStats() {
        const result = await getCentralPool().query(centralSql.listTenantStats)
        return result.rows.map(mapTenantStats)
      },
    },
    members: {
      async listMembers(tenantId) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const result = await getTenantPool(tenant).query(tenantSql.listMembers)
        return result.rows.map(mapMember)
      },
      async findMember(tenantId, memberId) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const result = await getTenantPool(tenant).query(tenantSql.findMember, [memberId])
        return result.rows[0] ? mapMember(result.rows[0]) : null
      },
      async createMember(tenantId, input) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const pool = getTenantPool(tenant)
        const branchName = input.branchName ?? 'Main Branch'
        const planName = input.planName ?? 'Monthly Basic'
        const branchResult = await pool.query(tenantSql.findBranchByName, [branchName])
        const planResult = await pool.query(tenantSql.findPlanByName, [planName])
        const branch = branchResult.rows[0]
        const plan = planResult.rows[0]
        if (!branch || !plan) {
          throw new Error('Selected branch or plan was not found for this tenant.')
        }

        const nextCode = await pool.query(tenantSql.nextMemberCode)
        const memberId = randomUUID()
        await pool.query(tenantSql.createMember, [
          memberId,
          `GF-2026-${String(readNumber(nextCode.rows[0], 'next_number')).padStart(5, '0')}`,
          input.name.trim(),
          input.phone.trim(),
          readString(branch, 'id'),
          readString(plan, 'id'),
          readNumber(plan, 'price_pkr'),
          input.dueDate ?? new Date().toISOString().slice(0, 10),
        ])

        const createdMember = await pool.query(tenantSql.findMember, [memberId])
        return createdMember.rows[0] ? mapMember(createdMember.rows[0]) : null
      },
      async updateMemberProfile(tenantId, memberId, input) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const pool = getTenantPool(tenant)
        const currentMemberResult = await pool.query(tenantSql.findMember, [memberId])
        const currentMember = currentMemberResult.rows[0] ? mapMember(currentMemberResult.rows[0]) : null
        if (!currentMember) return null

        const branchName = input.branchName ?? currentMember.branchName
        const planName = input.planName ?? currentMember.planName
        const branchResult = await pool.query(tenantSql.findBranchByName, [branchName])
        const planResult = await pool.query(tenantSql.findPlanByName, [planName])
        const branch = branchResult.rows[0]
        const plan = planResult.rows[0]
        if (!branch || !plan) {
          throw new Error('Selected branch or plan was not found for this tenant.')
        }

        await pool.query(tenantSql.updateMemberProfile, [
          memberId,
          input.name?.trim() || currentMember.name,
          input.phone?.trim() || currentMember.phone,
          readString(branch, 'id'),
          readString(plan, 'id'),
          input.status ?? currentMember.status,
          input.dueDate ?? currentMember.dueDate,
        ])

        const updatedMember = await pool.query(tenantSql.findMember, [memberId])
        return updatedMember.rows[0] ? mapMember(updatedMember.rows[0]) : null
      },
      async updateMember(tenantId, updatedMember) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        await getTenantPool(tenant).query(tenantSql.updateMemberBalance, [
          updatedMember.id,
          updatedMember.currentBalancePkr,
          updatedMember.status,
        ])
        return updatedMember
      },
    },
    payments: {
      async listPayments(tenantId) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const result = await getTenantPool(tenant).query(tenantSql.listPayments)
        return result.rows.map(mapPayment)
      },
      async createPayment(tenantId, payment, updatedMember) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        await withTenantTransaction(tenant, async (client) => {
          await client.query(tenantSql.createPayment, [
            payment.id,
            payment.memberId,
            payment.collectedBy,
            payment.amountPaidPkr,
            payment.discountPkr,
            payment.lateFeePkr,
            payment.method,
            payment.transactionId,
            payment.paymentType,
            payment.outstandingAfterPkr,
            payment.extendsExpiry,
            payment.collectedAt,
          ])
          await client.query(tenantSql.updateMemberBalance, [
            updatedMember.id,
            updatedMember.currentBalancePkr,
            updatedMember.status,
          ])
          await client.query(tenantSql.createReceipt, [
            randomUUID(),
            payment.receiptNo,
            payment.id,
            payment.memberId,
            JSON.stringify({ payment, member: updatedMember }),
          ])
        })

        return { payment, member: updatedMember }
      },
      async nextReceiptNumber(tenantId) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return '00144'

        const result = await getTenantPool(tenant).query(tenantSql.nextReceiptNumber)
        return String(readNumber(result.rows[0], 'next_number')).padStart(5, '0')
      },
    },
    notifications: {
      async listLogs(tenantId) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const result = await getTenantPool(tenant).query(tenantSql.listNotificationLogs)
        return result.rows.map(mapNotificationLog)
      },
      async sendReminder(tenantId, input) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const pool = getTenantPool(tenant)
        const memberResult = await pool.query(tenantSql.findMember, [input.memberId])
        if (!memberResult.rows[0]) return null

        const templateResult = await pool.query(tenantSql.findNotificationTemplate, [input.triggerCode])
        const template = templateResult.rows[0]
        if (!template) {
          throw new Error(`Notification template was not found: ${input.triggerCode}`)
        }

        const result = await pool.query(tenantSql.createNotificationLog, [
          randomUUID(),
          input.memberId,
          readString(template, 'id'),
          input.channel,
          input.triggerCode,
        ])
        return result.rows[0] ? mapNotification(result.rows[0]) : null
      },
      async retryNotification(tenantId, notificationId) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const pool = getTenantPool(tenant)
        const notificationResult = await pool.query(tenantSql.findNotificationLog, [notificationId])
        const notification = notificationResult.rows[0] ? mapNotification(notificationResult.rows[0]) : null
        if (!notification) return null

        const result = await pool.query(tenantSql.createNotificationLog, [
          randomUUID(),
          notification.memberId,
          notification.templateId,
          notification.channel,
          notification.triggerCode,
        ])
        return result.rows[0] ? mapNotification(result.rows[0]) : null
      },
    },
    renewals: {
      async listRenewalQueue(tenantId) {
        const members = await thisProviderMembersList(tenantId)
        if (!members) return null
        return members
          .filter((member) => member.status !== 'cancelled')
          .map(mapRenewalItem)
          .sort((first, second) => first.dueDate.localeCompare(second.dueDate))
      },
      async updateRenewalStatus(tenantId, memberId, action) {
        const member = await thisProviderFindMember(tenantId, memberId)
        if (!member) return null

        const updatedMember = await thisProviderUpdateMember(tenantId, {
          ...member,
          status: renewalActionToMemberStatus(action),
          currentBalancePkr: action === 'paid' ? 0 : member.currentBalancePkr || planPrice(member.planName),
          lastPaymentDate: action === 'paid' ? new Date().toISOString().slice(0, 10) : member.lastPaymentDate,
        })
        return updatedMember ? mapRenewalItem(updatedMember) : null
      },
    },
    settings: {
      async getTenantSettings(tenantId) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const pool = getTenantPool(tenant)
        const [branches, membershipPlans] = await Promise.all([
          pool.query(tenantSql.listBranches),
          pool.query(tenantSql.listMembershipPlans),
        ])
        return {
          branches: branches.rows.map(mapBranch),
          membershipPlans: membershipPlans.rows.map(mapMembershipPlan),
          staffAccess: defaultStaffAccess(),
        } satisfies TenantSettingsRecord
      },
      async createBranch(tenantId, input) {
        return upsertTenantBranch(tenantId, randomUUID(), input)
      },
      async updateBranch(tenantId, branchId, input) {
        return upsertTenantBranch(tenantId, branchId, input)
      },
      async createMembershipPlan(tenantId, input) {
        return upsertTenantMembershipPlan(tenantId, randomUUID(), input)
      },
      async updateMembershipPlan(tenantId, planId, input) {
        return upsertTenantMembershipPlan(tenantId, planId, input)
      },
    },
    reports: {
      async getTenantReportSummary(tenantId) {
        const members = await thisProviderMembersList(tenantId)
        const payments = await thisProviderPaymentsList(tenantId)
        if (!members || !payments) return null

        const paymentMethodBreakdown = payments.reduce<TenantReportSummary['paymentMethodBreakdown']>(
          (breakdown, payment) => {
            const existing = breakdown.find((item) => item.method === payment.method)
            if (existing) existing.amountPkr += payment.amountPaidPkr
            else breakdown.push({ method: payment.method, amountPkr: payment.amountPaidPkr })
            return breakdown
          },
          [],
        )

        return {
          collectionsPkr: payments.reduce((sum, payment) => sum + payment.amountPaidPkr, 0),
          outstandingDuesPkr: members.reduce((sum, member) => sum + member.currentBalancePkr, 0),
          renewalDueCount: members.filter((member) => member.status !== 'cancelled').length,
          activeMembers: members.filter((member) => member.status === 'active' || member.status === 'balance_due').length,
          suspendedMembers: members.filter((member) => member.status === 'suspended' || member.status === 'cancelled').length,
          paymentMethodBreakdown,
        }
      },
    },
    billing: {
      async listInvoices() {
        const result = await getCentralPool().query(centralSql.listBillingInvoices)
        return result.rows.map(mapBillingInvoice)
      },
      async getSummary() {
        const result = await getCentralPool().query(centralSql.billingSummary)
        return mapBillingSummary(result.rows[0])
      },
      async createInvoice(input) {
        const now = new Date()
        const periodStart = input.periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
        const periodEnd = input.periodEnd ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
        const dueDate = input.dueDate ?? addDays(now, 7).toISOString().slice(0, 10)
        const invoiceNumber = `INV-${now.getFullYear()}-${String(Date.now()).slice(-5)}`
        const result = await getCentralPool().query(centralSql.createBillingInvoice, [
          randomUUID(),
          invoiceNumber,
          input.tenantId,
          periodStart,
          periodEnd,
          dueDate,
        ])
        return result.rows[0] ? mapBillingInvoice(result.rows[0]) : null
      },
      async markInvoicePaid(invoiceId) {
        const result = await getCentralPool().query(centralSql.markBillingInvoicePaid, [
          invoiceId,
          `GF-PAY-${Date.now()}`,
        ])
        return result.rows[0] ? mapBillingInvoice(result.rows[0]) : null
      },
    },
    audit: {
      async listTenantAuditLogs(tenantId) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const result = await getTenantPool(tenant).query(tenantSql.listTenantAuditLogs, [tenantId])
        return result.rows.map(mapAuditLog)
      },
      async recordTenantAuditLog(tenantId, input) {
        const tenant = await requireTenant(tenantId)
        if (!tenant) return null

        const result = await getTenantPool(tenant).query(tenantSql.createTenantAuditLog, [
          randomUUID(),
          input.actorUserId,
          input.action,
          input.entityType,
          input.entityId ?? null,
          JSON.stringify(input.metadata ?? {}),
          tenantId,
          input.actorName,
        ])
        return result.rows[0] ? mapAuditLog(result.rows[0]) : null
      },
      async listPlatformAuditLogs() {
        const result = await getCentralPool().query(centralSql.listPlatformAuditLogs)
        return result.rows.map(mapAuditLog)
      },
      async recordPlatformAuditLog(input) {
        const result = await getCentralPool().query(centralSql.createPlatformAuditLog, [
          randomUUID(),
          input.actorUserId,
          input.action,
          input.entityType,
          input.entityId ?? null,
          JSON.stringify(input.metadata ?? {}),
          input.actorName,
        ])
        return mapAuditLog(result.rows[0])
      },
    },
  }

  async function thisProviderMembersList(tenantId: string) {
    const tenant = await requireTenant(tenantId)
    if (!tenant) return null
    const result = await getTenantPool(tenant).query(tenantSql.listMembers)
    return result.rows.map(mapMember)
  }

  async function thisProviderFindMember(tenantId: string, memberId: string) {
    const tenant = await requireTenant(tenantId)
    if (!tenant) return null
    const result = await getTenantPool(tenant).query(tenantSql.findMember, [memberId])
    return result.rows[0] ? mapMember(result.rows[0]) : null
  }

  async function thisProviderUpdateMember(tenantId: string, updatedMember: MemberRecord) {
    const tenant = await requireTenant(tenantId)
    if (!tenant) return null
    await getTenantPool(tenant).query(tenantSql.updateMemberBalance, [
      updatedMember.id,
      updatedMember.currentBalancePkr,
      updatedMember.status,
    ])
    return updatedMember
  }

  async function thisProviderPaymentsList(tenantId: string) {
    const tenant = await requireTenant(tenantId)
    if (!tenant) return null
    const result = await getTenantPool(tenant).query(tenantSql.listPayments)
    return result.rows.map(mapPayment)
  }

  async function upsertTenantBranch(
    tenantId: string,
    branchId: string,
    input: UpsertBranchInput | Partial<UpsertBranchInput>,
  ) {
    const tenant = await requireTenant(tenantId)
    if (!tenant) return null

    const result = await getTenantPool(tenant).query(tenantSql.upsertBranch, [
      branchId,
      input.name?.trim() || 'New Branch',
      input.city?.trim() || 'Karachi',
      input.address ?? null,
      input.isActive ?? true,
    ])
    return result.rows[0] ? mapBranch(result.rows[0]) : null
  }

  async function upsertTenantMembershipPlan(
    tenantId: string,
    planId: string,
    input: UpsertMembershipPlanInput | Partial<UpsertMembershipPlanInput>,
  ) {
    const tenant = await requireTenant(tenantId)
    if (!tenant) return null

    const result = await getTenantPool(tenant).query(tenantSql.upsertMembershipPlan, [
      planId,
      input.name?.trim() || 'New Plan',
      input.billingCycle ?? 'monthly',
      input.pricePkr ?? 3500,
      input.graceDays ?? 3,
      input.isActive ?? true,
    ])
    return result.rows[0] ? mapMembershipPlan(result.rows[0]) : null
  }
}

type NormalizedProvisionTenantInput = Required<ProvisionTenantInput>

function normalizeProvisionTenantInput(input: ProvisionTenantInput): NormalizedProvisionTenantInput {
  const slug = input.slug.toLowerCase().trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Tenant slug must use lowercase letters, numbers, and hyphens.')
  }

  const databaseName = input.databaseName ?? `tenant_${slug.replaceAll('-', '_')}`
  assertSafeDatabaseName(databaseName)

  return {
    name: input.name.trim(),
    slug,
    planCode: input.planCode ?? 'growth',
    databaseName,
    primaryDomain: input.primaryDomain ?? `${slug}.gymflow.pk`,
    adminName: input.adminName.trim(),
    adminEmail: input.adminEmail.toLowerCase().trim(),
    city: input.city?.trim() || 'Karachi',
    branchName: input.branchName?.trim() || 'Main Branch',
  }
}

function normalizePlanCode(planCode: string) {
  return planCode.toLowerCase().trim().replaceAll(' ', '-')
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function planPrice(planName: string) {
  if (planName.includes('Annual')) return 12000
  if (planName.includes('Quarterly')) return 9000
  if (planName.includes('Pro')) return 4500
  return 3500
}

function renewalActionToMemberStatus(action: RenewalAction): MemberStatus {
  if (action === 'paid') return 'active'
  if (action === 'overdue') return 'dues_pending'
  return 'balance_due'
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

function mapRenewalItem(member: MemberRecord): RenewalQueueItem {
  return {
    memberId: member.id,
    memberName: member.name,
    memberCode: member.memberCode,
    planName: member.planName,
    branchName: member.branchName,
    dueDate: member.dueDate,
    amountPkr: member.currentBalancePkr || planPrice(member.planName),
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

function assertSafeDatabaseName(databaseName: string) {
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(databaseName)) {
    throw new Error('Tenant database name must start with a letter and use only lowercase letters, numbers, and underscores.')
  }
}

function quoteIdentifier(identifier: string) {
  assertSafeDatabaseName(identifier)
  return `"${identifier.replaceAll('"', '""')}"`
}

async function createProvisioningJob(tenant: TenantRecord, requestedBy: UserSession, step: string) {
  const result = await getCentralPool().query(centralSql.createProvisioningJob, [
    randomUUID(),
    tenant.id,
    requestedBy.id,
    step,
  ])
  return mapProvisioningJob(result.rows[0])
}

async function updateProvisioningJob(
  jobId: string,
  status: ProvisioningJobRecord['status'],
  step: string,
  errorMessage: string | null,
) {
  const result = await getCentralPool().query(centralSql.updateProvisioningJob, [
    jobId,
    status,
    step,
    errorMessage,
  ])
  return mapProvisioningJob(result.rows[0])
}

async function ensureTenantDatabase(databaseName: string) {
  const adminPool = getAdminPool()
  const existingDatabase = await adminPool.query('select 1 from pg_database where datname = $1', [databaseName])
  if (existingDatabase.rowCount) return
  await adminPool.query(`create database ${quoteIdentifier(databaseName)}`)
}

async function applyTenantSchema(databaseName: string) {
  const schema = readFileSync(join(process.cwd(), 'backend/db/tenant.sql'), 'utf8')
  const pool = new Pool({ connectionString: getTenantConnectionString(databaseName) })
  try {
    await pool.query(schema)
  } finally {
    await pool.end()
  }
}

async function seedTenantDefaults(tenant: TenantRecord, input: NormalizedProvisionTenantInput) {
  const pool = getTenantPool(tenant)
  await pool.query(tenantSql.seedDefaultTenantUser, [
    randomUUID(),
    input.adminName,
    input.adminEmail,
  ])
  await pool.query(tenantSql.seedDefaultBranch, [
    randomUUID(),
    input.branchName,
    input.city,
  ])
  await pool.query(tenantSql.seedDefaultPlans, [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ])
  await pool.query(tenantSql.seedDefaultNotificationTemplates, [
    randomUUID(),
    randomUUID(),
  ])
}

function readString(row: QueryResultRow, key: string) {
  const value = row[key]
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function readNumber(row: QueryResultRow | undefined, key: string) {
  const value = row?.[key]
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  return Number(value ?? 0)
}

function readBoolean(row: QueryResultRow, key: string) {
  const value = row[key]
  if (typeof value === 'boolean') return value
  return value === 'true' || value === 't' || value === 1
}

function readDateString(row: QueryResultRow, key: string) {
  const value = row[key]
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value ?? '')
}

function mapTenant(row: QueryResultRow): TenantRecord {
  return {
    id: readString(row, 'id'),
    name: readString(row, 'name'),
    slug: readString(row, 'slug'),
    status: readString(row, 'status') as TenantRecord['status'],
    plan: readString(row, 'plan'),
    databaseName: readString(row, 'database_name'),
    primaryDomain: readString(row, 'primary_domain'),
  }
}

function mapSubscriptionPlan(row: QueryResultRow): SubscriptionPlanRecord {
  return {
    id: readString(row, 'id'),
    code: readString(row, 'code'),
    name: readString(row, 'name'),
    monthlyPricePkr: readNumber(row, 'monthly_price_pkr'),
    maxBranches: row.max_branches === null || row.max_branches === undefined ? null : readNumber(row, 'max_branches'),
    maxMembers: row.max_members === null || row.max_members === undefined ? null : readNumber(row, 'max_members'),
    whatsappEnabled: readBoolean(row, 'whatsapp_enabled'),
    smsEnabled: readBoolean(row, 'sms_enabled'),
    advancedReportsEnabled: readBoolean(row, 'advanced_reports_enabled'),
    isActive: readBoolean(row, 'is_active'),
  }
}

function mapTenantStats(row: QueryResultRow): TenantStatsRecord {
  return {
    tenantId: readString(row, 'tenant_id'),
    activeMembers: readNumber(row, 'active_members'),
    suspendedMembers: readNumber(row, 'suspended_members'),
    monthlyRevenuePkr: readNumber(row, 'monthly_revenue_pkr'),
    outstandingDuesPkr: readNumber(row, 'outstanding_dues_pkr'),
    renewalDueCount: readNumber(row, 'renewal_due_count'),
  }
}

function mapBillingInvoice(row: QueryResultRow): BillingInvoiceRecord {
  return {
    id: readString(row, 'id'),
    invoiceNumber: readString(row, 'invoice_number'),
    tenantId: readString(row, 'tenant_id'),
    tenantName: readString(row, 'tenant_name'),
    planName: readString(row, 'plan_name'),
    amountPkr: readNumber(row, 'amount_pkr'),
    status: readString(row, 'status') as BillingInvoiceRecord['status'],
    periodStart: readDateString(row, 'period_start'),
    periodEnd: readDateString(row, 'period_end'),
    dueDate: readDateString(row, 'due_date'),
    paidAt: row.paid_at ? readString(row, 'paid_at') : null,
    provider: readString(row, 'provider') as BillingInvoiceRecord['provider'],
    providerReference: row.provider_reference ? readString(row, 'provider_reference') : null,
    createdAt: readString(row, 'created_at'),
  }
}

function mapBillingSummary(row: QueryResultRow | undefined): BillingSummaryRecord {
  return {
    mrrPkr: readNumber(row, 'mrr_pkr'),
    issuedPkr: readNumber(row, 'issued_pkr'),
    paidPkr: readNumber(row, 'paid_pkr'),
    overduePkr: readNumber(row, 'overdue_pkr'),
    openInvoiceCount: readNumber(row, 'open_invoice_count'),
  }
}

function mapProvisioningJob(row: QueryResultRow): ProvisioningJobRecord {
  return {
    id: readString(row, 'id'),
    tenantId: readString(row, 'tenant_id'),
    requestedBy: readString(row, 'requested_by'),
    status: readString(row, 'status') as ProvisioningJobRecord['status'],
    step: readString(row, 'step'),
    errorMessage: row.error_message ? readString(row, 'error_message') : null,
    startedAt: row.started_at ? readString(row, 'started_at') : null,
    completedAt: row.completed_at ? readString(row, 'completed_at') : null,
    createdAt: readString(row, 'created_at'),
  }
}

function mapPlatformUser(row: QueryResultRow): UserSession {
  return {
    id: readString(row, 'id'),
    name: readString(row, 'name'),
    email: readString(row, 'email'),
    role: 'super-admin',
    portal: 'super-admin',
  }
}

function mapTenantUser(row: QueryResultRow, tenant: TenantRecord): UserSession {
  const databaseRole = readString(row, 'role')
  return {
    id: readString(row, 'id'),
    name: readString(row, 'name'),
    email: readString(row, 'email'),
    role: databaseRole === 'tenant_admin' ? 'tenant-admin' : 'staff',
    portal: 'tenant',
    tenantId: tenant.id,
  }
}

function mapMember(row: QueryResultRow): MemberRecord {
  return {
    id: readString(row, 'id'),
    memberCode: readString(row, 'member_code'),
    name: readString(row, 'name'),
    phone: readString(row, 'phone'),
    branchId: readString(row, 'branch_id'),
    branchName: readString(row, 'branch_name'),
    planId: readString(row, 'plan_id'),
    planName: readString(row, 'plan_name'),
    status: readString(row, 'status') as MemberStatus,
    currentBalancePkr: readNumber(row, 'current_balance_pkr'),
    dueDate: readDateString(row, 'due_date'),
    lastPaymentDate: readDateString(row, 'last_payment_date'),
  }
}

function mapPayment(row: QueryResultRow): PaymentRecord {
  return {
    id: readString(row, 'id'),
    receiptNo: readString(row, 'receipt_no'),
    memberId: readString(row, 'member_id'),
    amountPaidPkr: readNumber(row, 'amount_paid_pkr'),
    discountPkr: readNumber(row, 'discount_pkr'),
    lateFeePkr: readNumber(row, 'late_fee_pkr'),
    method: readString(row, 'method') as PaymentMethod,
    transactionId: row.transaction_id ? readString(row, 'transaction_id') : null,
    paymentType: readString(row, 'payment_type') as PaymentRecord['paymentType'],
    outstandingAfterPkr: readNumber(row, 'outstanding_after_pkr'),
    extendsExpiry: readBoolean(row, 'extends_expiry'),
    collectedBy: readString(row, 'collected_by'),
    collectedAt: readString(row, 'collected_at'),
  }
}

function mapNotification(row: QueryResultRow): NotificationRecord {
  return {
    id: readString(row, 'id'),
    memberId: readString(row, 'member_id'),
    templateId: row.template_id ? readString(row, 'template_id') : null,
    triggerCode: readString(row, 'trigger_code'),
    channel: readString(row, 'channel') as NotificationChannel,
    status: readString(row, 'status') as NotificationRecord['status'],
    providerMessageId: row.provider_message_id ? readString(row, 'provider_message_id') : null,
    failureReason: row.failure_reason ? readString(row, 'failure_reason') : null,
    createdAt: readString(row, 'created_at'),
  }
}

function mapNotificationLog(row: QueryResultRow): NotificationLogRecord {
  return {
    ...mapNotification(row),
    memberName: readString(row, 'member_name'),
  }
}

function mapBranch(row: QueryResultRow): BranchRecord {
  return {
    id: readString(row, 'id'),
    name: readString(row, 'name'),
    city: readString(row, 'city'),
    address: row.address ? readString(row, 'address') : null,
    isActive: readBoolean(row, 'is_active'),
  }
}

function mapMembershipPlan(row: QueryResultRow): MembershipPlanRecord {
  return {
    id: readString(row, 'id'),
    name: readString(row, 'name'),
    billingCycle: readString(row, 'billing_cycle') as MembershipPlanRecord['billingCycle'],
    pricePkr: readNumber(row, 'price_pkr'),
    graceDays: readNumber(row, 'grace_days'),
    isActive: readBoolean(row, 'is_active'),
  }
}

function mapAuditLog(row: QueryResultRow): AuditLogRecord {
  const rawMetadata = row.metadata
  const metadata = typeof rawMetadata === 'string'
    ? JSON.parse(rawMetadata) as Record<string, unknown>
    : (rawMetadata ?? {}) as Record<string, unknown>

  return {
    id: readString(row, 'id'),
    scope: readString(row, 'scope') as AuditLogRecord['scope'],
    tenantId: row.tenant_id ? readString(row, 'tenant_id') : null,
    actorUserId: readString(row, 'actor_user_id'),
    actorName: readString(row, 'actor_name'),
    action: readString(row, 'action'),
    entityType: readString(row, 'entity_type'),
    entityId: row.entity_id ? readString(row, 'entity_id') : null,
    metadata,
    createdAt: readString(row, 'created_at'),
  }
}
