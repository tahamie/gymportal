import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createToken, readJsonBody, sendError, sendOk } from './http.js'
import { requirePlatformContext, requireTenantContext } from './guards.js'
import {
  auditRepository,
  authRepository,
  billingRepository,
  membersRepository,
  notificationsRepository,
  paymentsRepository,
  platformRepository,
  renewalsRepository,
  reportsRepository,
  settingsRepository,
} from './repositories/index.js'
import type {
  CreateAuditLogInput,
  CreateBillingInvoiceInput,
  CreateMemberInput,
  CreatePaymentInput,
  MembershipPlanRecord,
  MemberStatus,
  NotificationChannel,
  PaymentMethod,
  PaymentRecord,
  Portal,
  ProvisionTenantInput,
  TenantStatus,
  UpdateTenantPlanInput,
  UpdateMemberInput,
  UpdateTenantStatusInput,
  SendReminderInput,
  RenewalAction,
  RenewalActionInput,
  UpsertBranchInput,
  UpsertMembershipPlanInput,
  UpsertSubscriptionPlanInput,
} from './types.js'

type LoginInput = {
  email: string
  password: string
  portal: Portal
  tenantSlug?: string
}

type CreateTenantInput = ProvisionTenantInput

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return ['cash', 'easypaisa', 'jazzcash', 'card', 'bank_transfer'].includes(String(value))
}

function isMemberStatus(value: unknown): value is MemberStatus {
  return ['active', 'balance_due', 'dues_pending', 'suspended', 'cancelled'].includes(String(value))
}

function isTenantStatus(value: unknown): value is TenantStatus {
  return ['trial', 'active', 'suspended', 'cancelled'].includes(String(value))
}

function isNotificationChannel(value: unknown): value is NotificationChannel {
  return ['whatsapp', 'sms', 'email'].includes(String(value))
}

function isRenewalAction(value: unknown): value is RenewalAction {
  return ['paid', 'overdue', 'reminder_queued'].includes(String(value))
}

function isBillingCycle(value: unknown): value is MembershipPlanRecord['billingCycle'] {
  return ['monthly', 'quarterly', 'annual'].includes(String(value))
}

function getPlanPrice(planName: string) {
  if (planName.includes('Annual')) return 12000
  if (planName.includes('Quarterly')) return 9000
  if (planName.includes('Pro')) return 4500
  return 3500
}

function auditActor(user: { id: string; name: string }) {
  return {
    actorUserId: user.id,
    actorName: user.name,
  }
}

function tenantAudit(
  user: { id: string; name: string },
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
): CreateAuditLogInput {
  return {
    ...auditActor(user),
    action,
    entityType,
    entityId,
    metadata,
  }
}

async function login(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody<LoginInput>(req)
  if (!body?.email || !body.password || !body.portal) {
    sendError(res, 400, 'INVALID_LOGIN', 'Email, password, and portal are required.')
    return
  }

  const tenant = body.portal === 'tenant'
    ? body.tenantSlug
      ? await platformRepository.findTenantBySlug(body.tenantSlug)
      : null
    : null
  if (body.portal === 'tenant') {
    if (!tenant) {
      sendError(res, 403, 'TENANT_ACCESS_DENIED', 'User cannot access this tenant.')
      return
    }
  }

  const user = await authRepository.findUserByEmail(body.email, {
    portal: body.portal,
    tenant,
  })
  if (!user || user.portal !== body.portal) {
    sendError(res, 401, 'INVALID_CREDENTIALS', 'Login details are invalid for this portal.')
    return
  }

  if (body.portal === 'tenant' && tenant && tenant.id !== user.tenantId) {
    sendError(res, 403, 'TENANT_ACCESS_DENIED', 'User cannot access this tenant.')
    return
  }

  sendOk(res, {
    accessToken: createToken(user),
    portal: user.portal,
    user,
  })
}

async function listMembers(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return
  const members = await membersRepository.listMembers(context.tenant.id)
  if (!members) {
    sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
    return
  }

  sendOk(res, {
    tenant: {
      id: context.tenant.id,
      name: context.tenant.name,
      slug: context.tenant.slug,
    },
    members,
  })
}

async function createMember(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const body = await readJsonBody<CreateMemberInput>(req)
  if (!body?.name || !body.phone) {
    sendError(res, 400, 'INVALID_MEMBER', 'name and phone are required.')
    return
  }

  try {
    const member = await membersRepository.createMember(context.tenant.id, body)
    if (!member) {
      sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
      return
    }
    await auditRepository.recordTenantAuditLog(context.tenant.id, tenantAudit(
      context.user,
      'member.created',
      'member',
      member.id,
      { memberCode: member.memberCode, name: member.name, planName: member.planName },
    ))
    sendOk(res, { member }, 201)
  } catch (error) {
    sendError(res, 400, 'MEMBER_CREATION_FAILED', error instanceof Error ? error.message : 'Member creation failed.')
  }
}

async function updateMember(req: IncomingMessage, res: ServerResponse, memberId: string) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const body = await readJsonBody<UpdateMemberInput>(req)
  if (body?.status && !isMemberStatus(body.status)) {
    sendError(res, 400, 'INVALID_MEMBER_STATUS', 'Member status is invalid.')
    return
  }

  try {
    const member = await membersRepository.updateMemberProfile(context.tenant.id, memberId, body ?? {})
    if (!member) {
      sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member was not found in this tenant.')
      return
    }
    await auditRepository.recordTenantAuditLog(context.tenant.id, tenantAudit(
      context.user,
      body?.status ? 'member.status_updated' : 'member.updated',
      'member',
      member.id,
      { memberCode: member.memberCode, status: member.status },
    ))
    sendOk(res, { member })
  } catch (error) {
    sendError(res, 400, 'MEMBER_UPDATE_FAILED', error instanceof Error ? error.message : 'Member update failed.')
  }
}

async function createPayment(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const body = await readJsonBody<CreatePaymentInput>(req)
  if (!body?.memberId || !body.amountPaidPkr || !isPaymentMethod(body.method)) {
    sendError(res, 400, 'INVALID_PAYMENT', 'memberId, amountPaidPkr, and method are required.')
    return
  }

  if (body.method !== 'cash' && !body.transactionId) {
    sendError(res, 400, 'TRANSACTION_ID_REQUIRED', 'Digital payments require a transaction ID.')
    return
  }

  const member = await membersRepository.findMember(context.tenant.id, body.memberId)
  if (!member) {
    sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member was not found in this tenant.')
    return
  }

  const discountPkr = body.discountPkr ?? 0
  const lateFeePkr = body.lateFeePkr ?? 0
  const currentOutstanding = member.currentBalancePkr || getPlanPrice(member.planName)
  const amountDue = Math.max(0, currentOutstanding + lateFeePkr - discountPkr)
  const outstandingAfterPkr = Math.max(0, amountDue - body.amountPaidPkr)
  const paymentType = outstandingAfterPkr > 0 ? 'partial' : 'full'
  const now = new Date().toISOString()
  const paymentNumber = await paymentsRepository.nextReceiptNumber(context.tenant.id)

  const payment: PaymentRecord = {
    id: randomUUID(),
    receiptNo: `RCP-2026-${paymentNumber}`,
    memberId: member.id,
    amountPaidPkr: body.amountPaidPkr,
    discountPkr,
    lateFeePkr,
    method: body.method,
    transactionId: body.transactionId ?? null,
    paymentType,
    outstandingAfterPkr,
    extendsExpiry: outstandingAfterPkr === 0,
    collectedBy: context.user.id,
    collectedAt: now,
  }

  const updatedMember = {
    ...member,
    currentBalancePkr: outstandingAfterPkr,
    lastPaymentDate: now.slice(0, 10),
    status: outstandingAfterPkr > 0 ? 'balance_due' : 'active',
  } as const

  const result = await paymentsRepository.createPayment(context.tenant.id, payment, updatedMember)
  if (!result) {
    sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
    return
  }

  await auditRepository.recordTenantAuditLog(context.tenant.id, tenantAudit(
    context.user,
    'payment.created',
    'payment',
    payment.id,
    {
      receiptNo: payment.receiptNo,
      memberId: payment.memberId,
      amountPaidPkr: payment.amountPaidPkr,
      outstandingAfterPkr: payment.outstandingAfterPkr,
      method: payment.method,
    },
  ))
  sendOk(res, result, 201)
}

async function listPayments(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return
  const payments = await paymentsRepository.listPayments(context.tenant.id)
  if (!payments) {
    sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
    return
  }

  sendOk(res, {
    tenantId: context.tenant.id,
    payments,
  })
}

async function sendReminder(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const body = await readJsonBody<SendReminderInput>(req)
  if (!body?.memberId) {
    sendError(res, 400, 'INVALID_REMINDER', 'memberId is required.')
    return
  }

  const channel = body.channel ?? 'whatsapp'
  if (!isNotificationChannel(channel)) {
    sendError(res, 400, 'INVALID_CHANNEL', 'Notification channel is invalid.')
    return
  }

  try {
    const notification = await notificationsRepository.sendReminder(context.tenant.id, {
      memberId: body.memberId,
      triggerCode: body.triggerCode ?? 'due_3_days',
      channel,
    })
    if (!notification) {
      sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member was not found in this tenant.')
      return
    }
    await auditRepository.recordTenantAuditLog(context.tenant.id, tenantAudit(
      context.user,
      'notification.reminder_queued',
      'notification',
      notification.id,
      { memberId: notification.memberId, channel: notification.channel, triggerCode: notification.triggerCode },
    ))
    sendOk(res, { notification }, 201)
  } catch (error) {
    sendError(res, 400, 'REMINDER_FAILED', error instanceof Error ? error.message : 'Reminder could not be queued.')
  }
}

async function listRenewals(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const renewals = await renewalsRepository.listRenewalQueue(context.tenant.id)
  if (!renewals) {
    sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
    return
  }

  sendOk(res, { renewals })
}

async function updateRenewal(req: IncomingMessage, res: ServerResponse, memberId: string) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const body = await readJsonBody<RenewalActionInput>(req)
  if (!body?.action || !isRenewalAction(body.action)) {
    sendError(res, 400, 'INVALID_RENEWAL_ACTION', 'Renewal action is invalid.')
    return
  }

  const renewal = await renewalsRepository.updateRenewalStatus(context.tenant.id, memberId, body.action)
  if (!renewal) {
    sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member was not found in this tenant.')
    return
  }

  let notification = null
  if (body.action === 'reminder_queued') {
    const channel = body.channel ?? 'whatsapp'
    if (!isNotificationChannel(channel)) {
      sendError(res, 400, 'INVALID_CHANNEL', 'Notification channel is invalid.')
      return
    }
    notification = await notificationsRepository.sendReminder(context.tenant.id, {
      memberId,
      triggerCode: 'due_3_days',
      channel,
    })
  }

  await auditRepository.recordTenantAuditLog(context.tenant.id, tenantAudit(
    context.user,
    'renewal.updated',
    'member',
    memberId,
    { action: body.action, notificationId: notification?.id ?? null },
  ))
  sendOk(res, { renewal, notification })
}

async function listNotifications(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const notifications = await notificationsRepository.listLogs(context.tenant.id)
  if (!notifications) {
    sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
    return
  }

  sendOk(res, { notifications })
}

async function retryNotification(req: IncomingMessage, res: ServerResponse, notificationId: string) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const notification = await notificationsRepository.retryNotification(context.tenant.id, notificationId)
  if (!notification) {
    sendError(res, 404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found in this tenant.')
    return
  }

  await auditRepository.recordTenantAuditLog(context.tenant.id, tenantAudit(
    context.user,
    'notification.retry_queued',
    'notification',
    notification.id,
    { originalNotificationId: notificationId, channel: notification.channel },
  ))
  sendOk(res, { notification }, 201)
}

async function getTenantSettings(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const settings = await settingsRepository.getTenantSettings(context.tenant.id)
  if (!settings) {
    sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
    return
  }

  sendOk(res, settings)
}

async function createBranch(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return
  if (context.user.role !== 'tenant-admin') {
    sendError(res, 403, 'FORBIDDEN', 'Only tenant admins can manage branches.')
    return
  }

  const body = await readJsonBody<UpsertBranchInput>(req)
  if (!body?.name || !body.city) {
    sendError(res, 400, 'INVALID_BRANCH', 'Branch name and city are required.')
    return
  }

  const branch = await settingsRepository.createBranch(context.tenant.id, body)
  if (!branch) {
    sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
    return
  }
  await auditRepository.recordTenantAuditLog(context.tenant.id, tenantAudit(
    context.user,
    'settings.branch_created',
    'branch',
    branch.id,
    { name: branch.name, city: branch.city },
  ))
  sendOk(res, { branch }, 201)
}

async function updateBranch(req: IncomingMessage, res: ServerResponse, branchId: string) {
  const context = await requireTenantContext(req, res)
  if (!context) return
  if (context.user.role !== 'tenant-admin') {
    sendError(res, 403, 'FORBIDDEN', 'Only tenant admins can manage branches.')
    return
  }

  const body = await readJsonBody<Partial<UpsertBranchInput>>(req)
  const branch = await settingsRepository.updateBranch(context.tenant.id, branchId, body ?? {})
  if (!branch) {
    sendError(res, 404, 'BRANCH_NOT_FOUND', 'Branch was not found in this tenant.')
    return
  }
  await auditRepository.recordTenantAuditLog(context.tenant.id, tenantAudit(
    context.user,
    'settings.branch_updated',
    'branch',
    branch.id,
    { name: branch.name, isActive: branch.isActive },
  ))
  sendOk(res, { branch })
}

async function createMembershipPlan(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return
  if (context.user.role !== 'tenant-admin') {
    sendError(res, 403, 'FORBIDDEN', 'Only tenant admins can manage plans.')
    return
  }

  const body = await readJsonBody<UpsertMembershipPlanInput>(req)
  if (!body?.name || !isBillingCycle(body.billingCycle) || !body.pricePkr) {
    sendError(res, 400, 'INVALID_MEMBERSHIP_PLAN', 'Plan name, billing cycle, and price are required.')
    return
  }

  const plan = await settingsRepository.createMembershipPlan(context.tenant.id, body)
  if (!plan) {
    sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
    return
  }
  await auditRepository.recordTenantAuditLog(context.tenant.id, tenantAudit(
    context.user,
    'settings.membership_plan_created',
    'membership_plan',
    plan.id,
    { name: plan.name, pricePkr: plan.pricePkr },
  ))
  sendOk(res, { plan }, 201)
}

async function updateMembershipPlan(req: IncomingMessage, res: ServerResponse, planId: string) {
  const context = await requireTenantContext(req, res)
  if (!context) return
  if (context.user.role !== 'tenant-admin') {
    sendError(res, 403, 'FORBIDDEN', 'Only tenant admins can manage plans.')
    return
  }

  const body = await readJsonBody<Partial<UpsertMembershipPlanInput>>(req)
  if (body?.billingCycle && !isBillingCycle(body.billingCycle)) {
    sendError(res, 400, 'INVALID_BILLING_CYCLE', 'Billing cycle is invalid.')
    return
  }

  const plan = await settingsRepository.updateMembershipPlan(context.tenant.id, planId, body ?? {})
  if (!plan) {
    sendError(res, 404, 'MEMBERSHIP_PLAN_NOT_FOUND', 'Membership plan was not found in this tenant.')
    return
  }
  await auditRepository.recordTenantAuditLog(context.tenant.id, tenantAudit(
    context.user,
    'settings.membership_plan_updated',
    'membership_plan',
    plan.id,
    { name: plan.name, pricePkr: plan.pricePkr, isActive: plan.isActive },
  ))
  sendOk(res, { plan })
}

async function getTenantReportSummary(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const summary = await reportsRepository.getTenantReportSummary(context.tenant.id)
  if (!summary) {
    sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
    return
  }

  sendOk(res, summary)
}

async function listTenantAuditLogs(req: IncomingMessage, res: ServerResponse) {
  const context = await requireTenantContext(req, res)
  if (!context) return

  const auditLogs = await auditRepository.listTenantAuditLogs(context.tenant.id)
  if (!auditLogs) {
    sendError(res, 404, 'TENANT_STORE_NOT_FOUND', 'Tenant data store was not found.')
    return
  }

  sendOk(res, { auditLogs })
}

async function listPlatformTenants(req: IncomingMessage, res: ServerResponse) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  sendOk(res, {
    tenants: await platformRepository.listTenants(),
  })
}

async function createPlatformTenant(req: IncomingMessage, res: ServerResponse) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  const body = await readJsonBody<CreateTenantInput>(req)
  if (!body?.name || !body.slug || !body.adminName || !body.adminEmail) {
    sendError(res, 400, 'INVALID_TENANT', 'name, slug, adminName, and adminEmail are required.')
    return
  }

  try {
    const result = await platformRepository.provisionTenant(body, context.user)
    await auditRepository.recordPlatformAuditLog(tenantAudit(
      context.user,
      'tenant.provisioned',
      'tenant',
      result.tenant.id,
      { slug: result.tenant.slug, plan: result.tenant.plan, jobStatus: result.job.status },
    ))
    sendOk(res, result, 201)
  } catch (error) {
    sendError(
      res,
      error instanceof Error && error.message.includes('already exists') ? 409 : 400,
      'TENANT_PROVISIONING_FAILED',
      error instanceof Error ? error.message : 'Tenant provisioning failed.',
    )
  }
}

async function updatePlatformTenantStatus(req: IncomingMessage, res: ServerResponse, tenantId: string) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  const body = await readJsonBody<UpdateTenantStatusInput>(req)
  if (!body?.status || !isTenantStatus(body.status)) {
    sendError(res, 400, 'INVALID_TENANT_STATUS', 'Tenant status is invalid.')
    return
  }

  const tenant = await platformRepository.updateTenantStatus(tenantId, body.status)
  if (!tenant) {
    sendError(res, 404, 'TENANT_NOT_FOUND', 'Tenant was not found.')
    return
  }

  await auditRepository.recordPlatformAuditLog(tenantAudit(
    context.user,
    'tenant.status_updated',
    'tenant',
    tenant.id,
    { status: tenant.status, slug: tenant.slug },
  ))
  sendOk(res, { tenant })
}

async function listPlatformPlans(req: IncomingMessage, res: ServerResponse) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  sendOk(res, {
    plans: await platformRepository.listSubscriptionPlans(),
  })
}

async function upsertPlatformPlan(req: IncomingMessage, res: ServerResponse) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  const body = await readJsonBody<UpsertSubscriptionPlanInput>(req)
  if (!body?.code || !body.name || !body.monthlyPricePkr) {
    sendError(res, 400, 'INVALID_SUBSCRIPTION_PLAN', 'Plan code, name, and monthly price are required.')
    return
  }

  const plan = await platformRepository.upsertSubscriptionPlan(body)
  await auditRepository.recordPlatformAuditLog(tenantAudit(
    context.user,
    'platform_plan.upserted',
    'subscription_plan',
    plan.id,
    { code: plan.code, name: plan.name, monthlyPricePkr: plan.monthlyPricePkr },
  ))
  sendOk(res, { plan }, 201)
}

async function updatePlatformTenantPlan(req: IncomingMessage, res: ServerResponse, tenantId: string) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  const body = await readJsonBody<UpdateTenantPlanInput>(req)
  if (!body?.planCode) {
    sendError(res, 400, 'INVALID_TENANT_PLAN', 'planCode is required.')
    return
  }

  const tenant = await platformRepository.updateTenantPlan(tenantId, body)
  if (!tenant) {
    sendError(res, 404, 'TENANT_OR_PLAN_NOT_FOUND', 'Tenant or subscription plan was not found.')
    return
  }

  await auditRepository.recordPlatformAuditLog(tenantAudit(
    context.user,
    'tenant.plan_updated',
    'tenant',
    tenant.id,
    { plan: tenant.plan, slug: tenant.slug },
  ))
  sendOk(res, { tenant })
}

async function listPlatformTenantStats(req: IncomingMessage, res: ServerResponse) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  sendOk(res, {
    stats: await platformRepository.listTenantStats(),
  })
}

async function listPlatformBilling(req: IncomingMessage, res: ServerResponse) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  sendOk(res, {
    summary: await billingRepository.getSummary(),
    invoices: await billingRepository.listInvoices(),
  })
}

async function createPlatformBillingInvoice(req: IncomingMessage, res: ServerResponse) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  const body = await readJsonBody<CreateBillingInvoiceInput>(req)
  if (!body?.tenantId) {
    sendError(res, 400, 'INVALID_BILLING_INVOICE', 'tenantId is required.')
    return
  }

  const invoice = await billingRepository.createInvoice(body)
  if (!invoice) {
    sendError(res, 404, 'TENANT_NOT_FOUND', 'Tenant was not found for billing.')
    return
  }

  await auditRepository.recordPlatformAuditLog(tenantAudit(
    context.user,
    'billing.invoice_created',
    'billing_invoice',
    invoice.id,
    { invoiceNumber: invoice.invoiceNumber, tenantId: invoice.tenantId, amountPkr: invoice.amountPkr },
  ))
  sendOk(res, { invoice }, 201)
}

async function markPlatformBillingInvoicePaid(req: IncomingMessage, res: ServerResponse, invoiceId: string) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  const invoice = await billingRepository.markInvoicePaid(invoiceId)
  if (!invoice) {
    sendError(res, 404, 'BILLING_INVOICE_NOT_FOUND', 'Billing invoice was not found.')
    return
  }

  await auditRepository.recordPlatformAuditLog(tenantAudit(
    context.user,
    'billing.invoice_paid',
    'billing_invoice',
    invoice.id,
    { invoiceNumber: invoice.invoiceNumber, tenantId: invoice.tenantId, providerReference: invoice.providerReference },
  ))
  sendOk(res, { invoice })
}

async function listPlatformAuditLogs(req: IncomingMessage, res: ServerResponse) {
  const context = requirePlatformContext(req, res)
  if (!context) return

  sendOk(res, {
    auditLogs: await auditRepository.listPlatformAuditLogs(),
  })
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Tenant-ID',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Origin': '*',
    })
    res.end()
    return
  }

  if (method === 'GET' && url.pathname === '/health') {
    sendOk(res, { status: 'ok', service: 'gymflow-api' })
    return
  }

  if (method === 'POST' && url.pathname === '/auth/login') {
    await login(req, res)
    return
  }

  if (method === 'GET' && url.pathname === '/tenant/members') {
    await listMembers(req, res)
    return
  }

  if (method === 'POST' && url.pathname === '/tenant/members') {
    await createMember(req, res)
    return
  }

  if (method === 'PATCH' && url.pathname.startsWith('/tenant/members/')) {
    const memberId = decodeURIComponent(url.pathname.replace('/tenant/members/', ''))
    await updateMember(req, res, memberId)
    return
  }

  if (method === 'GET' && url.pathname === '/tenant/payments') {
    await listPayments(req, res)
    return
  }

  if (method === 'POST' && url.pathname === '/tenant/payments') {
    await createPayment(req, res)
    return
  }

  if (method === 'POST' && url.pathname === '/tenant/notifications/reminders') {
    await sendReminder(req, res)
    return
  }

  if (method === 'GET' && url.pathname === '/tenant/renewals') {
    await listRenewals(req, res)
    return
  }

  if (method === 'PATCH' && url.pathname.startsWith('/tenant/renewals/')) {
    const memberId = decodeURIComponent(url.pathname.replace('/tenant/renewals/', ''))
    await updateRenewal(req, res, memberId)
    return
  }

  if (method === 'GET' && url.pathname === '/tenant/notifications') {
    await listNotifications(req, res)
    return
  }

  if (method === 'POST' && url.pathname.startsWith('/tenant/notifications/') && url.pathname.endsWith('/retry')) {
    const notificationId = decodeURIComponent(url.pathname.replace('/tenant/notifications/', '').replace('/retry', ''))
    await retryNotification(req, res, notificationId)
    return
  }

  if (method === 'GET' && url.pathname === '/tenant/settings') {
    await getTenantSettings(req, res)
    return
  }

  if (method === 'POST' && url.pathname === '/tenant/settings/branches') {
    await createBranch(req, res)
    return
  }

  if (method === 'PATCH' && url.pathname.startsWith('/tenant/settings/branches/')) {
    const branchId = decodeURIComponent(url.pathname.replace('/tenant/settings/branches/', ''))
    await updateBranch(req, res, branchId)
    return
  }

  if (method === 'POST' && url.pathname === '/tenant/settings/membership-plans') {
    await createMembershipPlan(req, res)
    return
  }

  if (method === 'PATCH' && url.pathname.startsWith('/tenant/settings/membership-plans/')) {
    const planId = decodeURIComponent(url.pathname.replace('/tenant/settings/membership-plans/', ''))
    await updateMembershipPlan(req, res, planId)
    return
  }

  if (method === 'GET' && url.pathname === '/tenant/reports/summary') {
    await getTenantReportSummary(req, res)
    return
  }

  if (method === 'GET' && url.pathname === '/tenant/audit-log') {
    await listTenantAuditLogs(req, res)
    return
  }

  if (method === 'GET' && url.pathname === '/platform/tenants') {
    await listPlatformTenants(req, res)
    return
  }

  if (method === 'POST' && url.pathname === '/platform/tenants') {
    await createPlatformTenant(req, res)
    return
  }

  if (method === 'PATCH' && url.pathname.startsWith('/platform/tenants/') && url.pathname.endsWith('/status')) {
    const tenantId = decodeURIComponent(url.pathname.replace('/platform/tenants/', '').replace('/status', ''))
    await updatePlatformTenantStatus(req, res, tenantId)
    return
  }

  if (method === 'GET' && url.pathname === '/platform/plans') {
    await listPlatformPlans(req, res)
    return
  }

  if (method === 'POST' && url.pathname === '/platform/plans') {
    await upsertPlatformPlan(req, res)
    return
  }

  if (method === 'PATCH' && url.pathname.startsWith('/platform/tenants/') && url.pathname.endsWith('/plan')) {
    const tenantId = decodeURIComponent(url.pathname.replace('/platform/tenants/', '').replace('/plan', ''))
    await updatePlatformTenantPlan(req, res, tenantId)
    return
  }

  if (method === 'GET' && url.pathname === '/platform/tenant-stats') {
    await listPlatformTenantStats(req, res)
    return
  }

  if (method === 'GET' && url.pathname === '/platform/billing') {
    await listPlatformBilling(req, res)
    return
  }

  if (method === 'POST' && url.pathname === '/platform/billing/invoices') {
    await createPlatformBillingInvoice(req, res)
    return
  }

  if (method === 'PATCH' && url.pathname.startsWith('/platform/billing/invoices/') && url.pathname.endsWith('/paid')) {
    const invoiceId = decodeURIComponent(url.pathname.replace('/platform/billing/invoices/', '').replace('/paid', ''))
    await markPlatformBillingInvoicePaid(req, res, invoiceId)
    return
  }

  if (method === 'GET' && url.pathname === '/platform/audit-log') {
    await listPlatformAuditLogs(req, res)
    return
  }

  sendError(res, 404, 'NOT_FOUND', 'Endpoint was not found.')
}
