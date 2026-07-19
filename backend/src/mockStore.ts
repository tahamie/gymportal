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

const fitZoneMembers: MemberRecord[] = []

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
