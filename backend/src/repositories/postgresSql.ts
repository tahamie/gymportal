export const centralSql = {
  findPlanByCode: `
    select id, code, name, monthly_price_pkr, max_branches, max_members, whatsapp_enabled,
           sms_enabled, advanced_reports_enabled, is_active
    from subscription_plans
    where code = $1 and is_active = true
    limit 1
  `,
  listPlans: `
    select id, code, name, monthly_price_pkr, max_branches, max_members, whatsapp_enabled,
           sms_enabled, advanced_reports_enabled, is_active
    from subscription_plans
    order by monthly_price_pkr
  `,
  upsertPlan: `
    insert into subscription_plans (
      id,
      code,
      name,
      monthly_price_pkr,
      max_branches,
      max_members,
      whatsapp_enabled,
      sms_enabled,
      advanced_reports_enabled,
      is_active
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    on conflict (code) do update
    set name = excluded.name,
        monthly_price_pkr = excluded.monthly_price_pkr,
        max_branches = excluded.max_branches,
        max_members = excluded.max_members,
        whatsapp_enabled = excluded.whatsapp_enabled,
        sms_enabled = excluded.sms_enabled,
        advanced_reports_enabled = excluded.advanced_reports_enabled,
        is_active = excluded.is_active,
        updated_at = now()
    returning id, code, name, monthly_price_pkr, max_branches, max_members, whatsapp_enabled,
              sms_enabled, advanced_reports_enabled, is_active
  `,
  updateTenantPlan: `
    update tenants
    set plan_id = $2,
        updated_at = now()
    where id = $1
    returning tenants.id,
              tenants.name,
              tenants.slug,
              tenants.status,
              (select subscription_plans.name from subscription_plans where subscription_plans.id = tenants.plan_id) as plan,
              tenants.database_name,
              tenants.primary_domain
  `,
  listTenantStats: `
    select tenants.id as tenant_id,
           coalesce(latest.active_members, 0) as active_members,
           coalesce(latest.suspended_members, 0) as suspended_members,
           coalesce(latest.monthly_revenue_pkr, 0) as monthly_revenue_pkr,
           coalesce(latest.outstanding_dues_pkr, 0) as outstanding_dues_pkr,
           coalesce(latest.renewal_due_count, 0) as renewal_due_count
    from tenants
    left join lateral (
      select active_members, suspended_members, monthly_revenue_pkr, outstanding_dues_pkr, renewal_due_count
      from tenant_stats
      where tenant_stats.tenant_id = tenants.id
      order by snapshot_date desc
      limit 1
    ) latest on true
    order by tenants.created_at desc
  `,
  listPlatformAuditLogs: `
    select platform_audit_log.id,
           'platform' as scope,
           null::text as tenant_id,
           platform_audit_log.actor_user_id,
           coalesce(platform_users.name, 'Platform user') as actor_name,
           platform_audit_log.action,
           platform_audit_log.entity_type,
           platform_audit_log.entity_id::text,
           platform_audit_log.metadata,
           platform_audit_log.created_at
    from platform_audit_log
    left join platform_users on platform_users.id = platform_audit_log.actor_user_id
    order by platform_audit_log.created_at desc
    limit 200
  `,
  createPlatformAuditLog: `
    insert into platform_audit_log (id, actor_user_id, action, entity_type, entity_id, metadata)
    values ($1, $2, $3, $4, $5, $6::jsonb)
    returning id,
              'platform' as scope,
              null::text as tenant_id,
              actor_user_id,
              $7::text as actor_name,
              action,
              entity_type,
              entity_id::text,
              metadata,
              created_at
  `,
  listBillingInvoices: `
    select billing_invoices.id,
           billing_invoices.invoice_number,
           billing_invoices.tenant_id,
           tenants.name as tenant_name,
           billing_invoices.plan_name,
           billing_invoices.amount_pkr,
           case
             when billing_invoices.status = 'issued' and billing_invoices.due_date < current_date then 'overdue'
             else billing_invoices.status
           end as status,
           billing_invoices.period_start,
           billing_invoices.period_end,
           billing_invoices.due_date,
           billing_invoices.paid_at,
           billing_invoices.provider,
           billing_invoices.provider_reference,
           billing_invoices.created_at
    from billing_invoices
    join tenants on tenants.id = billing_invoices.tenant_id
    order by billing_invoices.created_at desc
    limit 200
  `,
  createBillingInvoice: `
    insert into billing_invoices (
      id,
      invoice_number,
      tenant_id,
      plan_name,
      amount_pkr,
      status,
      period_start,
      period_end,
      due_date,
      provider
    )
    select $1,
           $2,
           tenants.id,
           subscription_plans.name,
           subscription_plans.monthly_price_pkr,
           'issued',
           $4::date,
           $5::date,
           $6::date,
           'manual'
    from tenants
    join subscription_plans on subscription_plans.id = tenants.plan_id
    where tenants.id = $3
    returning id,
              invoice_number,
              tenant_id,
              (select name from tenants where tenants.id = billing_invoices.tenant_id) as tenant_name,
              plan_name,
              amount_pkr,
              status,
              period_start,
              period_end,
              due_date,
              paid_at,
              provider,
              provider_reference,
              created_at
  `,
  markBillingInvoicePaid: `
    update billing_invoices
    set status = 'paid',
        paid_at = now(),
        provider = 'external_stub',
        provider_reference = $2
    where id = $1
    returning id,
              invoice_number,
              tenant_id,
              (select name from tenants where tenants.id = billing_invoices.tenant_id) as tenant_name,
              plan_name,
              amount_pkr,
              status,
              period_start,
              period_end,
              due_date,
              paid_at,
              provider,
              provider_reference,
              created_at
  `,
  billingSummary: `
    with normalized_invoices as (
      select amount_pkr,
             case
               when status = 'issued' and due_date < current_date then 'overdue'
               else status
             end as status
      from billing_invoices
    )
    select coalesce((
             select sum(subscription_plans.monthly_price_pkr)
             from tenants
             join subscription_plans on subscription_plans.id = tenants.plan_id
             where tenants.status <> 'cancelled'
           ), 0) as mrr_pkr,
           coalesce(sum(amount_pkr) filter (where status in ('issued', 'overdue')), 0) as issued_pkr,
           coalesce(sum(amount_pkr) filter (where status = 'paid'), 0) as paid_pkr,
           coalesce(sum(amount_pkr) filter (where status = 'overdue'), 0) as overdue_pkr,
           coalesce(count(*) filter (where status in ('issued', 'overdue')), 0) as open_invoice_count
    from normalized_invoices
  `,
  findUserByEmail: `
    select id, name, email, role, 'super-admin' as portal
    from platform_users
    where lower(email) = lower($1)
    limit 1
  `,
  listTenants: `
    select tenants.id,
           tenants.name,
           tenants.slug,
           tenants.status,
           subscription_plans.name as plan,
           tenants.database_name,
           tenants.primary_domain
    from tenants
    join subscription_plans on subscription_plans.id = tenants.plan_id
    order by tenants.created_at desc
  `,
  findTenantById: `
    select tenants.id,
           tenants.name,
           tenants.slug,
           tenants.status,
           subscription_plans.name as plan,
           tenants.database_name,
           tenants.primary_domain
    from tenants
    join subscription_plans on subscription_plans.id = tenants.plan_id
    where tenants.id = $1
    limit 1
  `,
  findTenantBySlug: `
    select tenants.id,
           tenants.name,
           tenants.slug,
           tenants.status,
           subscription_plans.name as plan,
           tenants.database_name,
           tenants.primary_domain
    from tenants
    join subscription_plans on subscription_plans.id = tenants.plan_id
    where tenants.slug = $1
    limit 1
  `,
  createTenant: `
    insert into tenants (
      id,
      name,
      slug,
      status,
      plan_id,
      database_name,
      primary_domain
    )
    values ($1, $2, $3, 'trial', $4, $5, $6)
    returning id, name, slug, status, $7::text as plan, database_name, primary_domain
  `,
  createProvisioningJob: `
    insert into provisioning_jobs (
      id,
      tenant_id,
      requested_by,
      status,
      step,
      started_at
    )
    values ($1, $2, $3, 'running', $4, now())
    returning id, tenant_id, requested_by, status, step, error_message, started_at, completed_at, created_at
  `,
  updateProvisioningJob: `
    update provisioning_jobs
    set status = $2,
        step = $3,
        error_message = $4,
        completed_at = case when $2 in ('completed', 'failed') then now() else completed_at end
    where id = $1
    returning id, tenant_id, requested_by, status, step, error_message, started_at, completed_at, created_at
  `,
  updateTenantStatus: `
    update tenants
    set status = $2,
        updated_at = now()
    where id = $1
    returning tenants.id,
              tenants.name,
              tenants.slug,
              tenants.status,
              (select subscription_plans.name from subscription_plans where subscription_plans.id = tenants.plan_id) as plan,
              tenants.database_name,
              tenants.primary_domain
  `,
}

export const tenantSql = {
  findBranchByName: `
    select id, name
    from branches
    where lower(name) = lower($1)
    order by created_at
    limit 1
  `,
  findPlanByName: `
    select id, name, price_pkr
    from membership_plans
    where lower(name) = lower($1)
    order by created_at
    limit 1
  `,
  seedDefaultTenantUser: `
    insert into tenant_users (id, name, email, password_hash, role)
    values ($1, $2, $3, 'demo-password-not-for-production', 'tenant_admin')
    on conflict (email) do update
    set name = excluded.name,
        role = excluded.role,
        is_active = true,
        updated_at = now()
  `,
  seedDefaultBranch: `
    insert into branches (id, name, city, address)
    values ($1, $2, $3, null)
    on conflict (id) do update
    set name = excluded.name,
        city = excluded.city,
        updated_at = now()
  `,
  seedDefaultPlans: `
    insert into membership_plans (id, name, billing_cycle, price_pkr, grace_days)
    values
      ($1, 'Monthly Basic', 'monthly', 3500, 3),
      ($2, 'Monthly Pro', 'monthly', 4500, 3),
      ($3, 'Quarterly Elite', 'quarterly', 9000, 5),
      ($4, 'Annual Elite', 'annual', 12000, 7)
    on conflict (id) do update
    set name = excluded.name,
        billing_cycle = excluded.billing_cycle,
        price_pkr = excluded.price_pkr,
        grace_days = excluded.grace_days,
        updated_at = now()
  `,
  seedDefaultNotificationTemplates: `
    insert into notification_templates (id, trigger_code, purpose, body)
    values
      ($1, 'due_3_days', 'Renewal reminder', 'Hi {{memberName}}, your membership is due on {{dueDate}}.'),
      ($2, 'overdue', 'Overdue reminder', 'Hi {{memberName}}, your payment is overdue. Please clear PKR {{balance}}.')
    on conflict (trigger_code) do update
    set purpose = excluded.purpose,
        body = excluded.body,
        is_active = true,
        updated_at = now()
  `,
  findNotificationTemplate: `
    select id, trigger_code
    from notification_templates
    where trigger_code = $1 and is_active = true
    limit 1
  `,
  createNotificationLog: `
    insert into notification_logs (
      id,
      member_id,
      template_id,
      channel,
      status,
      provider_message_id,
      failure_reason
    )
    values ($1, $2, $3, $4, 'queued', null, null)
    returning id,
              member_id,
              template_id,
              $5::text as trigger_code,
              channel,
              status,
              provider_message_id,
              failure_reason,
              created_at
  `,
  listNotificationLogs: `
    select notification_logs.id,
           notification_logs.member_id,
           notification_logs.template_id,
           coalesce(notification_templates.trigger_code, 'manual') as trigger_code,
           notification_logs.channel,
           notification_logs.status,
           notification_logs.provider_message_id,
           notification_logs.failure_reason,
           notification_logs.created_at,
           coalesce(members.name, 'Unknown member') as member_name
    from notification_logs
    left join members on members.id = notification_logs.member_id
    left join notification_templates on notification_templates.id = notification_logs.template_id
    order by notification_logs.created_at desc
  `,
  findNotificationLog: `
    select notification_logs.id,
           notification_logs.member_id,
           notification_logs.template_id,
           coalesce(notification_templates.trigger_code, 'manual') as trigger_code,
           notification_logs.channel,
           notification_logs.status,
           notification_logs.provider_message_id,
           notification_logs.failure_reason,
           notification_logs.created_at
    from notification_logs
    left join notification_templates on notification_templates.id = notification_logs.template_id
    where notification_logs.id = $1
    limit 1
  `,
  findTenantUserByEmail: `
    select id, name, email, role, true as is_active
    from tenant_users
    where lower(email) = lower($1)
    limit 1
  `,
  listMembers: `
    select members.id,
           members.member_code,
           members.name,
           members.phone,
           members.branch_id,
           branches.name as branch_name,
           members.plan_id,
           membership_plans.name as plan_name,
           members.status,
           members.current_balance_pkr,
           members.due_date,
           coalesce(max(payments.collected_at)::date::text, '') as last_payment_date
    from members
    join branches on branches.id = members.branch_id
    join membership_plans on membership_plans.id = members.plan_id
    left join payments on payments.member_id = members.id
    group by members.id, branches.name, membership_plans.name
    order by members.name
  `,
  nextMemberCode: `
    select count(*) + 284 as next_number
    from members
  `,
  createMember: `
    insert into members (
      id,
      member_code,
      name,
      phone,
      branch_id,
      plan_id,
      status,
      current_balance_pkr,
      due_date
    )
    values ($1, $2, $3, $4, $5, $6, 'active', $7, $8)
  `,
  updateMemberProfile: `
    update members
    set name = $2,
        phone = $3,
        branch_id = $4,
        plan_id = $5,
        status = $6,
        due_date = $7,
        updated_at = now()
    where id = $1
  `,
  findMember: `
    select members.id,
           members.member_code,
           members.name,
           members.phone,
           members.branch_id,
           branches.name as branch_name,
           members.plan_id,
           membership_plans.name as plan_name,
           members.status,
           members.current_balance_pkr,
           members.due_date,
           coalesce(max(payments.collected_at)::date::text, '') as last_payment_date
    from members
    join branches on branches.id = members.branch_id
    join membership_plans on membership_plans.id = members.plan_id
    left join payments on payments.member_id = members.id
    where members.id = $1
    group by members.id, branches.name, membership_plans.name
    limit 1
  `,
  updateMemberBalance: `
    update members
    set current_balance_pkr = $2,
        status = $3,
        updated_at = now()
    where id = $1
  `,
  listPayments: `
    select payments.id,
           receipts.receipt_no,
           payments.member_id,
           payments.amount_paid_pkr,
           payments.discount_pkr,
           payments.late_fee_pkr,
           payments.method,
           payments.transaction_id,
           payments.payment_type,
           payments.outstanding_after_pkr,
           payments.extends_expiry,
           payments.collected_by,
           payments.collected_at
    from payments
    left join receipts on receipts.payment_id = payments.id
    order by payments.collected_at desc
  `,
  createPayment: `
    insert into payments (
      id,
      member_id,
      collected_by,
      amount_paid_pkr,
      discount_pkr,
      late_fee_pkr,
      method,
      transaction_id,
      payment_type,
      outstanding_after_pkr,
      extends_expiry,
      collected_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `,
  createReceipt: `
    insert into receipts (id, receipt_no, payment_id, member_id, rendered_payload)
    values ($1, $2, $3, $4, $5::jsonb)
  `,
  nextReceiptNumber: `
    select count(*) + 144 as next_number
    from payments
  `,
  listBranches: `
    select id, name, city, address, is_active
    from branches
    order by created_at
  `,
  upsertBranch: `
    insert into branches (id, name, city, address, is_active)
    values ($1, $2, $3, $4, $5)
    on conflict (id) do update
    set name = excluded.name,
        city = excluded.city,
        address = excluded.address,
        is_active = excluded.is_active,
        updated_at = now()
    returning id, name, city, address, is_active
  `,
  listMembershipPlans: `
    select id, name, billing_cycle, price_pkr, grace_days, is_active
    from membership_plans
    order by created_at
  `,
  upsertMembershipPlan: `
    insert into membership_plans (id, name, billing_cycle, price_pkr, grace_days, is_active)
    values ($1, $2, $3, $4, $5, $6)
    on conflict (id) do update
    set name = excluded.name,
        billing_cycle = excluded.billing_cycle,
        price_pkr = excluded.price_pkr,
        grace_days = excluded.grace_days,
        is_active = excluded.is_active,
        updated_at = now()
    returning id, name, billing_cycle, price_pkr, grace_days, is_active
  `,
  listTenantAuditLogs: `
    select tenant_audit_log.id,
           'tenant' as scope,
           $1::text as tenant_id,
           tenant_audit_log.actor_user_id,
           coalesce(tenant_users.name, 'Tenant user') as actor_name,
           tenant_audit_log.action,
           tenant_audit_log.entity_type,
           tenant_audit_log.entity_id::text,
           tenant_audit_log.metadata,
           tenant_audit_log.created_at
    from tenant_audit_log
    left join tenant_users on tenant_users.id = tenant_audit_log.actor_user_id
    order by tenant_audit_log.created_at desc
    limit 200
  `,
  createTenantAuditLog: `
    insert into tenant_audit_log (id, actor_user_id, action, entity_type, entity_id, metadata)
    values ($1, $2, $3, $4, $5, $6::jsonb)
    returning id,
              'tenant' as scope,
              $7::text as tenant_id,
              actor_user_id,
              $8::text as actor_name,
              action,
              entity_type,
              entity_id::text,
              metadata,
              created_at
  `,
}
