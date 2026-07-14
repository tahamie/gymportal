import type {
  BranchRecord,
  MemberRecord,
  MembershipPlanRecord,
  PaymentRecord,
  SubscriptionPlanRecord,
  TenantRecord,
  TenantStore,
  UserSession,
} from './types.js'

export const centralUsers: UserSession[] = [
  {
    id: 'usr_platform_ops',
    name: 'GymFlow Operations',
    email: 'ops@gymflow.pk',
    role: 'super-admin',
    portal: 'super-admin',
  },
  {
    id: 'usr_tenant_admin',
    name: 'Ayesha Siddiqui',
    email: 'admin@fitzone.pk',
    role: 'tenant-admin',
    portal: 'tenant',
    tenantId: 'tenant_fitzone_khi',
  },
  {
    id: 'usr_staff_sana',
    name: 'Sana Javed',
    email: 'staff@fitzone.pk',
    role: 'staff',
    portal: 'tenant',
    tenantId: 'tenant_fitzone_khi',
  },
]

export const tenants: TenantRecord[] = [
  {
    id: 'tenant_fitzone_khi',
    name: 'FitZone Karachi',
    slug: 'fitzone-khi',
    status: 'active',
    plan: 'Growth',
    databaseName: 'tenant_fitzone_khi',
    primaryDomain: 'fitzone-khi.gymflow.pk',
  },
  {
    id: 'tenant_irontemple_lhr',
    name: 'Iron Temple Lahore',
    slug: 'irontemple-lhr',
    status: 'trial',
    plan: 'Professional',
    databaseName: 'tenant_irontemple_lhr',
    primaryDomain: 'irontemple-lhr.gymflow.pk',
  },
]

export const subscriptionPlans: SubscriptionPlanRecord[] = [
  {
    id: 'sub_starter',
    code: 'starter',
    name: 'Starter',
    monthlyPricePkr: 12000,
    maxBranches: 1,
    maxMembers: 500,
    whatsappEnabled: true,
    smsEnabled: true,
    advancedReportsEnabled: false,
    isActive: true,
  },
  {
    id: 'sub_growth',
    code: 'growth',
    name: 'Growth',
    monthlyPricePkr: 24000,
    maxBranches: 3,
    maxMembers: 2000,
    whatsappEnabled: true,
    smsEnabled: true,
    advancedReportsEnabled: true,
    isActive: true,
  },
  {
    id: 'sub_professional',
    code: 'professional',
    name: 'Professional',
    monthlyPricePkr: 42000,
    maxBranches: null,
    maxMembers: null,
    whatsappEnabled: true,
    smsEnabled: true,
    advancedReportsEnabled: true,
    isActive: true,
  },
]

const fitZoneMembers: MemberRecord[] = [
  {
    id: 'mem_ali_raza',
    memberCode: 'GF-2026-00284',
    name: 'Ali Raza',
    phone: '+92 300 129 8821',
    branchId: 'br_dha',
    branchName: 'DHA Branch',
    planId: 'plan_monthly_pro',
    planName: 'Monthly Pro',
    status: 'active',
    currentBalancePkr: 0,
    dueDate: '2026-07-22',
    lastPaymentDate: '2026-07-10',
  },
  {
    id: 'mem_hira_khan',
    memberCode: 'GF-2026-00285',
    name: 'Hira Khan',
    phone: '+92 321 663 4481',
    branchId: 'br_main',
    branchName: 'Main Branch',
    planId: 'plan_monthly_basic',
    planName: 'Monthly Basic',
    status: 'balance_due',
    currentBalancePkr: 1700,
    dueDate: '2026-07-13',
    lastPaymentDate: '2026-07-08',
  },
  {
    id: 'mem_usman_malik',
    memberCode: 'GF-2026-00286',
    name: 'Usman Malik',
    phone: '+92 333 554 1187',
    branchId: 'br_gulberg',
    branchName: 'Gulberg',
    planId: 'plan_quarterly_elite',
    planName: 'Quarterly Elite',
    status: 'dues_pending',
    currentBalancePkr: 3500,
    dueDate: '2026-07-10',
    lastPaymentDate: '2026-06-09',
  },
]

export const defaultBranches: BranchRecord[] = [
  { id: 'br_main', name: 'Main Branch', city: 'Karachi', address: 'Main Boulevard', isActive: true },
  { id: 'br_dha', name: 'DHA Branch', city: 'Karachi', address: 'DHA Phase 6', isActive: true },
  { id: 'br_gulberg', name: 'Gulberg', city: 'Lahore', address: 'Gulberg III', isActive: true },
]

export const defaultMembershipPlans: MembershipPlanRecord[] = [
  { id: 'plan_monthly_basic', name: 'Monthly Basic', billingCycle: 'monthly', pricePkr: 3500, graceDays: 3, isActive: true },
  { id: 'plan_monthly_pro', name: 'Monthly Pro', billingCycle: 'monthly', pricePkr: 4500, graceDays: 3, isActive: true },
  { id: 'plan_quarterly_elite', name: 'Quarterly Elite', billingCycle: 'quarterly', pricePkr: 9000, graceDays: 5, isActive: true },
  { id: 'plan_annual_elite', name: 'Annual Elite', billingCycle: 'annual', pricePkr: 12000, graceDays: 7, isActive: true },
]

export const tenantStores = new Map<string, TenantStore>([
  [
    'tenant_fitzone_khi',
    {
      members: fitZoneMembers,
      payments: [] satisfies PaymentRecord[],
      branches: defaultBranches,
      membershipPlans: defaultMembershipPlans,
    },
  ],
  [
    'tenant_irontemple_lhr',
    {
      members: [],
      payments: [] satisfies PaymentRecord[],
      branches: defaultBranches,
      membershipPlans: defaultMembershipPlans,
    },
  ],
])

export function findUserByEmail(email: string) {
  return centralUsers.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null
}

export function findTenantBySlug(slug: string) {
  return tenants.find((tenant) => tenant.slug === slug) ?? null
}

export function findTenantById(tenantId: string) {
  return tenants.find((tenant) => tenant.id === tenantId) ?? null
}

export function getTenantStore(tenantId: string) {
  return tenantStores.get(tenantId) ?? null
}
