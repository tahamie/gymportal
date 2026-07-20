import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  mockGymFlowApi,
  type AuditLog,
  type AuthSession,
  type CreateMemberInput,
  type LoginRole,
  type Member,
  type MemberStatus,
  type NotificationLog,
  type PaymentMethod,
  type PlatformBillingInvoice,
  type PlatformBillingSummary,
  type PlatformPlan,
  type PlatformTenantStats,
  type PlatformTenantStatus,
  type Portal,
  type ProvisionTenantInput,
  type RenewalQueueItem,
  type TenantPayment,
  type TenantReportSummary,
  type TenantSettings,
  type UpdateMemberInput,
} from './services/mockGymFlow'
import { gymFlowApi, type ApiMode } from './services/gymFlowApi'
import './App.css'

type TenantPage =
  | 'dashboard'
  | 'members'
  | 'payments'
  | 'renewals'
  | 'notifications'
  | 'reports'
  | 'settings'

type SuperAdminPage =
  | 'platform-dashboard'
  | 'tenants'
  | 'plans'
  | 'provisioning'
  | 'platform-settings'

type AppRoute = {
  portal: Portal | null
  tenantPage: TenantPage
  superPage: SuperAdminPage
}

type RoleAccess = {
  tenantPages: TenantPage[]
  superAdminPages: SuperAdminPage[]
  canAddMember: boolean
  canManageSettings: boolean
  scope: string
}

type IconName =
  | 'badge'
  | 'bell'
  | 'building'
  | 'calendar'
  | 'check'
  | 'credit'
  | 'dashboard'
  | 'download'
  | 'dumbbell'
  | 'eye'
  | 'filter'
  | 'gauge'
  | 'list'
  | 'message'
  | 'plus'
  | 'receipt'
  | 'search'
  | 'settings'
  | 'shield'
  | 'spark'
  | 'user-plus'
  | 'users'
  | 'wallet'
  | 'x'

const tenantPages = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'members', label: 'Members', icon: 'users' },
  { id: 'payments', label: 'Payments', icon: 'wallet' },
  { id: 'renewals', label: 'Renewals', icon: 'calendar' },
  { id: 'notifications', label: 'Notifications', icon: 'message' },
  { id: 'reports', label: 'Reports', icon: 'list' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
] satisfies Array<{ id: TenantPage; label: string; icon: IconName }>

const tenantPageIds = tenantPages.map((page) => page.id)

const superAdminPages = [
  { id: 'platform-dashboard', label: 'Platform', icon: 'dashboard' },
  { id: 'tenants', label: 'Tenants', icon: 'building' },
  { id: 'plans', label: 'Plans', icon: 'badge' },
  { id: 'provisioning', label: 'Provisioning', icon: 'spark' },
  { id: 'platform-settings', label: 'Settings', icon: 'settings' },
] satisfies Array<{ id: SuperAdminPage; label: string; icon: IconName }>

const superAdminPageIds = superAdminPages.map((page) => page.id)

const roleAccess: Record<LoginRole, RoleAccess> = {
  'tenant-admin': {
    tenantPages: tenantPageIds,
    superAdminPages: [],
    canAddMember: true,
    canManageSettings: true,
    scope: 'Full tenant controls for this gym only.',
  },
  staff: {
    tenantPages: ['dashboard', 'members', 'payments', 'renewals', 'notifications', 'reports'],
    superAdminPages: [],
    canAddMember: true,
    canManageSettings: false,
    scope: 'Operational access. Critical tenant settings are hidden.',
  },
  'super-admin': {
    tenantPages: [],
    superAdminPages: superAdminPageIds,
    canAddMember: false,
    canManageSettings: true,
    scope: 'Central platform access. No direct tenant member records.',
  },
}

const members: Member[] = []
const notificationTemplates = mockGymFlowApi.tenant.getNotificationTemplates()
const tenants = [] as ReturnType<typeof mockGymFlowApi.platform.getTenants>
const loginOptions = mockGymFlowApi.auth.listLoginOptions()
type TenantSummary = (typeof tenants)[number]

const activeSessionKey = 'gymflow-active-session'

function formatPKR(value: number) {
  return `PKR ${value.toLocaleString('en-PK')}`
}

function formatDateLabel(value: string) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTimeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return formatDateLabel(value)
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatActionLabel(action: string) {
  return action
    .split('.')
    .map((part) => part.replaceAll('_', ' '))
    .join(' · ')
}

function csvCell(value: string | number | boolean | null | undefined) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function getPlanPrice(plan: string) {
  if (plan.includes('Annual')) return 12000
  if (plan.includes('Quarterly')) return 9000
  if (plan.includes('Pro')) return 4500
  return 3500
}

function isTenantPage(value: string | undefined): value is TenantPage {
  return tenantPageIds.includes(value as TenantPage)
}

function isSuperAdminPage(value: string | undefined): value is SuperAdminPage {
  return superAdminPageIds.includes(value as SuperAdminPage)
}

function appBasePath() {
  const baseUrl = import.meta.env.BASE_URL ?? '/'
  if (baseUrl === '/') return ''
  return baseUrl.replace(/\/$/, '')
}

function pathWithoutBase(pathname: string) {
  const basePath = appBasePath()
  if (!basePath) return pathname
  if (pathname === basePath) return '/'
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || '/'
  return pathname
}

function pathWithBase(pathname: string) {
  const basePath = appBasePath()
  if (!basePath) return pathname
  return pathname === '/' ? `${basePath}/` : `${basePath}${pathname}`
}

function readRoute(): AppRoute {
  const [, portalSegment, pageSegment] = pathWithoutBase(window.location.pathname).split('/')

  if (portalSegment === 'tenant' && isTenantPage(pageSegment)) {
    return { portal: 'tenant', tenantPage: pageSegment, superPage: 'platform-dashboard' }
  }

  if (portalSegment === 'super-admin' && isSuperAdminPage(pageSegment)) {
    return { portal: 'super-admin', tenantPage: 'dashboard', superPage: pageSegment }
  }

  return { portal: null, tenantPage: 'dashboard', superPage: 'platform-dashboard' }
}

function routePath(portal: Portal | null, page?: TenantPage | SuperAdminPage) {
  if (portal === 'tenant') return pathWithBase(`/tenant/${page ?? 'dashboard'}`)
  if (portal === 'super-admin') return pathWithBase(`/super-admin/${page ?? 'platform-dashboard'}`)
  return pathWithBase('/')
}

function pushRoute(portal: Portal | null, page?: TenantPage | SuperAdminPage) {
  const nextPath = routePath(portal, page)
  if (window.location.pathname !== nextPath) {
    window.history.pushState({}, '', nextPath)
  }
}

function defaultPageFor(session: AuthSession) {
  const access = roleAccess[session.role]
  if (session.portal === 'super-admin') return access.superAdminPages[0] ?? 'platform-dashboard'
  return access.tenantPages[0] ?? 'dashboard'
}

function isPageAllowed(session: AuthSession, page: TenantPage | SuperAdminPage) {
  const access = roleAccess[session.role]
  if (session.portal === 'super-admin') return access.superAdminPages.includes(page as SuperAdminPage)
  return access.tenantPages.includes(page as TenantPage)
}

function readStoredSession() {
  const storedSession = window.localStorage.getItem(activeSessionKey)
  if (!storedSession) return null

  try {
    const parsedSession = JSON.parse(storedSession) as AuthSession
    if (!parsedSession.portal || !parsedSession.role || !parsedSession.name) return null
    return parsedSession
  } catch {
    return null
  }
}

function storeSession(session: AuthSession) {
  window.localStorage.setItem(activeSessionKey, JSON.stringify(session))
}

function clearStoredSession() {
  window.localStorage.removeItem(activeSessionKey)
}

function readInitialSession(route: AppRoute) {
  if (!route.portal) {
    clearStoredSession()
    return null
  }

  const storedSession = readStoredSession()
  if (!storedSession || storedSession.portal !== route.portal) {
    clearStoredSession()
    return null
  }
  return storedSession
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() => readRoute())
  const [session, setSession] = useState<AuthSession | null>(() => readInitialSession(readRoute()))
  const [isRestoringSession, setIsRestoringSession] = useState(() => readInitialSession(readRoute()) !== null)
  const [apiMode, setApiMode] = useState<ApiMode>(() => gymFlowApi.mode.get())
  const [membersData, setMembersData] = useState<Member[]>(members)
  const [tenantRows, setTenantRows] = useState(tenants)
  const [query, setQuery] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [paymentMemberId, setPaymentMemberId] = useState('')
  const [selectedTenant, setSelectedTenant] = useState<TenantSummary | null>(null)
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false)
  const [isProvisionTenantOpen, setIsProvisionTenantOpen] = useState(false)
  const [loginError, setLoginError] = useState('')
  const isSuperAdmin = session?.portal === 'super-admin'
  const access = session ? roleAccess[session.role] : null

  useEffect(() => {
    function handlePopState() {
      setRoute(readRoute())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!session || !isRestoringSession) return

    let isMounted = true
    const sessionToRestore = session
    async function restoreSession() {
      try {
        if (sessionToRestore.portal === 'super-admin') {
          const restoredTenants = await gymFlowApi.platform.getTenants(sessionToRestore)
          if (!isMounted) return
          setTenantRows(restoredTenants)
          setMembersData(members)
        } else {
          const restoredMembers = await gymFlowApi.tenant.getMembers(sessionToRestore)
          if (!isMounted) return
          setMembersData(restoredMembers)
          setTenantRows(tenants)
        }
        setApiMode(sessionToRestore.apiMode ?? gymFlowApi.mode.get())
        setLoginError('')
      } catch (error) {
        if (!isMounted) return
        clearStoredSession()
        setSession(null)
        setLoginError(error instanceof Error ? error.message : 'Session expired. Please sign in again.')
      } finally {
        if (isMounted) setIsRestoringSession(false)
      }
    }

    restoreSession()
    return () => {
      isMounted = false
    }
  }, [isRestoringSession, session])

  const filteredMembers = useMemo(() => {
    const needle = query.toLowerCase().trim()
    if (!needle) return membersData
    return membersData.filter((member) =>
      [member.name, member.id, member.phone, member.branch, member.status]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [membersData, query])

  useEffect(() => {
    if (!session) return
    const routedPage = session.portal === 'super-admin' ? route.superPage : route.tenantPage
    if (route.portal !== session.portal || !isPageAllowed(session, routedPage)) {
      const nextPage = isPageAllowed(session, routedPage) ? routedPage : defaultPageFor(session)
      pushRoute(session.portal, nextPage)
      setRoute(readRoute())
    }
  }, [route, session])

  if (isRestoringSession) {
    return (
      <main className="auth-shell">
        <section className="auth-panel panel restoring-panel" aria-label="Restoring session">
          <div className="brand auth-brand">
            <div className="brand-mark">
              <AppIcon name="shield" size={24} />
            </div>
            <div>
              <strong>GymFlow</strong>
              <span>Restoring workspace</span>
            </div>
          </div>
          <div className="rule-box auth-note">
            <AppIcon name="spark" size={18} />
            <span>Loading your last session and refreshing live workspace data.</span>
          </div>
        </section>
      </main>
    )
  }

  if (!session) {
    return (
      <LoginView
        apiMode={apiMode}
        loginError={loginError}
        route={route}
        onApiModeChange={(nextMode) => {
          setApiMode(nextMode)
          gymFlowApi.mode.set(nextMode)
          clearStoredSession()
          setLoginError('')
        }}
        onLogin={async (selectedSession) => {
          try {
            setLoginError('')
            const nextSession = await gymFlowApi.auth.login(selectedSession, apiMode)
            if (nextSession.portal === 'super-admin') {
              setTenantRows(await gymFlowApi.platform.getTenants(nextSession))
              setMembersData(members)
            } else {
              setMembersData(await gymFlowApi.tenant.getMembers(nextSession))
              setTenantRows(tenants)
            }
            storeSession(nextSession)
            setApiMode(nextSession.apiMode ?? apiMode)
            setSession(nextSession)
            setQuery('')
            setSelectedMember(null)
            setIsAddMemberOpen(false)
            const routedPage = route.portal === nextSession.portal
              ? nextSession.portal === 'super-admin'
                ? route.superPage
                : route.tenantPage
              : defaultPageFor(nextSession)
            const nextPage = isPageAllowed(nextSession, routedPage) ? routedPage : defaultPageFor(nextSession)
            pushRoute(nextSession.portal, nextPage)
            setRoute(readRoute())
          } catch (error) {
            setLoginError(error instanceof Error ? error.message : 'Unable to sign in.')
            throw error
          }
        }}
      />
    )
  }

  const activePages = (isSuperAdmin ? superAdminPages : tenantPages).filter((page) =>
    isSuperAdmin
      ? access?.superAdminPages.includes(page.id as SuperAdminPage)
      : access?.tenantPages.includes(page.id as TenantPage),
  )
  const routedPage = isSuperAdmin ? route.superPage : route.tenantPage
  const activePage = isPageAllowed(session, routedPage) ? routedPage : defaultPageFor(session)
  const pageTitle = activePages.find((page) => page.id === activePage)?.label ?? 'Dashboard'
  const loginLabel = isSuperAdmin ? 'Super Admin session' : 'Tenant session'

  return (
    <div className={isSuperAdmin ? 'app-shell super-admin-shell' : 'app-shell'}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <AppIcon name={isSuperAdmin ? 'shield' : 'dumbbell'} size={22} />
          </div>
          <div>
            <strong>{isSuperAdmin ? 'GymFlow HQ' : 'GymFlow'}</strong>
            <span>{session.workspace}</span>
          </div>
        </div>

        <div className="portal-switcher" aria-label="Login context">
          <span>{loginLabel}</span>
          <div className="session-card">
            <strong>{session.name}</strong>
            <small>{session.title} · {session.url}</small>
            <span className={session.apiMode === 'backend' ? 'mode-pill backend' : 'mode-pill mock'}>
              {session.apiMode === 'backend' ? 'Server API' : 'Demo mock'}
            </span>
          </div>
          <small>{isSuperAdmin ? 'Central controls only. Tenant data stays isolated.' : 'Gym staff workspace. Tenant database only.'}</small>
          <button
            className="portal-option active"
            onClick={() => {
              clearStoredSession()
              setSession(null)
              setSelectedMember(null)
              setSelectedTenant(null)
              setIsAddMemberOpen(false)
              setIsProvisionTenantOpen(false)
              pushRoute(null)
              setRoute(readRoute())
            }}
            type="button"
          >
            <AppIcon name="x" size={15} />
            Switch login
          </button>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {activePages.map((page) => {
            return (
              <button
                className={activePage === page.id ? 'nav-item active' : 'nav-item'}
                key={page.id}
                onClick={() => {
                  pushRoute(session.portal, page.id)
                  setRoute(readRoute())
                }}
                type="button"
              >
                <AppIcon name={page.icon} size={18} />
                <span>{page.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-panel">
          <AppIcon name={isSuperAdmin ? 'building' : 'shield'} size={18} />
          <div>
            <strong>{isSuperAdmin ? 'Platform portal' : 'Tenant isolated'}</strong>
            <span>{isSuperAdmin ? 'Separate login, billing, tenants, provisioning.' : 'Database per gym, stats synced nightly.'}</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{isSuperAdmin ? 'Super Admin · Central DB · PKR' : 'Pakistan · PKR · PKT'}</span>
            <h1>{pageTitle}</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" aria-label="Notifications">
              <AppIcon name="bell" size={18} />
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                if (isSuperAdmin) {
                  setIsProvisionTenantOpen(true)
                } else {
                  setIsAddMemberOpen(true)
                }
              }}
            >
              <AppIcon name="plus" size={18} />
              {isSuperAdmin ? 'Onboard gym' : access?.canAddMember ? 'New member' : 'Request access'}
            </button>
          </div>
        </header>

        <section className="access-banner" aria-label="Role permissions">
          <AppIcon name="shield" size={17} />
          <span>{session.title}</span>
          <strong>{access?.scope}</strong>
        </section>

        <section className="toolbar" aria-label="Workspace controls">
          <label className="search-box">
            <AppIcon name="search" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isSuperAdmin ? 'Search tenants, owners, plans, subdomains' : 'Search members, phones, IDs, branches'}
            />
          </label>
          <div className="segmented">
            <button className="selected" type="button">Today</button>
            <button type="button">7 days</button>
            <button type="button">30 days</button>
          </div>
          <button className="ghost-button" type="button">
            <AppIcon name="filter" size={17} />
            Filters
          </button>
        </section>

        {!isSuperAdmin && activePage === 'dashboard' && (
          <Dashboard
            members={membersData}
            session={session}
            onAddMember={() => setIsAddMemberOpen(true)}
            onOpenMember={setSelectedMember}
          />
        )}
        {!isSuperAdmin && activePage === 'members' && (
          <MembersTable
            members={filteredMembers}
            onAddMember={() => setIsAddMemberOpen(true)}
            onOpenMember={setSelectedMember}
          />
        )}
        {!isSuperAdmin && activePage === 'payments' && (
          <PaymentsView
            members={membersData}
            session={session}
            initialSelectedMemberId={paymentMemberId}
            onMembersChange={setMembersData}
          />
        )}
        {!isSuperAdmin && activePage === 'renewals' && <RenewalsView session={session} onMembersRefresh={setMembersData} />}
        {!isSuperAdmin && activePage === 'notifications' && <NotificationsView session={session} />}
        {!isSuperAdmin && activePage === 'reports' && <ReportsView role={session.role} session={session} />}
        {!isSuperAdmin && activePage === 'settings' && <SettingsView session={session} />}
        {isSuperAdmin && (
          <SuperAdminView
            activePage={activePage as SuperAdminPage}
            session={session}
            tenants={tenantRows}
            onProvisionTenant={() => setIsProvisionTenantOpen(true)}
            onManageTenant={setSelectedTenant}
            onTenantsChange={setTenantRows}
          />
        )}
      </main>

      {selectedMember && (
        <MemberDrawer
          member={selectedMember}
          session={session}
          onClose={() => setSelectedMember(null)}
          onCollectFee={(member) => {
            setPaymentMemberId(member.id)
            setSelectedMember(null)
            pushRoute('tenant', 'payments')
            setRoute(readRoute())
          }}
          onUpdate={async (member, input) => {
            const updatedMember = await gymFlowApi.tenant.updateMember(session, member, input)
            setSelectedMember(updatedMember)
            setMembersData((currentMembers) =>
              currentMembers.map((currentMember) => currentMember.id === member.id ? updatedMember : currentMember),
            )
            return updatedMember
          }}
        />
      )}
      {isAddMemberOpen && (
        <AddMemberModal
          session={session}
          onClose={() => setIsAddMemberOpen(false)}
          onCreate={async (input) => {
            const createdMember = await gymFlowApi.tenant.createMember(session, input)
            setMembersData((currentMembers) => [createdMember, ...currentMembers])
            return createdMember
          }}
        />
      )}
      {isProvisionTenantOpen && (
        <ProvisionTenantModal
          session={session}
          onClose={() => setIsProvisionTenantOpen(false)}
          onProvision={async (input) => {
            const result = await gymFlowApi.platform.provisionTenant(session, input)
            setTenantRows((currentRows) => {
              const withoutDuplicate = currentRows.filter((tenant) => tenant.slug !== result.tenant.slug)
              return [result.tenant, ...withoutDuplicate]
            })
            return result
          }}
        />
      )}
      {selectedTenant && (
        <TenantStatusModal
          tenant={selectedTenant}
          session={session}
          onClose={() => setSelectedTenant(null)}
          onUpdateStatus={async (tenant, status) => {
            const updatedTenant = await gymFlowApi.platform.updateTenantStatus(session, tenant, status)
            setTenantRows((currentRows) =>
              currentRows.map((currentTenant) => currentTenant.id === updatedTenant.id ? updatedTenant : currentTenant),
            )
            setSelectedTenant(updatedTenant)
            return updatedTenant
          }}
        />
      )}
    </div>
  )
}

function LoginView({
  apiMode,
  loginError,
  route,
  onApiModeChange,
  onLogin,
}: {
  apiMode: ApiMode
  loginError: string
  route: AppRoute
  onApiModeChange: (mode: ApiMode) => void
  onLogin: (session: AuthSession) => Promise<void>
}) {
  const [selectedPortal, setSelectedPortal] = useState<Portal>(route.portal ?? 'tenant')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const options = loginOptions.filter((option) => option.portal === selectedPortal)
  const featuredOption = options[0]
  const allowMockMode = gymFlowApi.mode.isMockAllowed()

  async function handleLogin(option: AuthSession) {
    setIsSigningIn(true)
    try {
      await onLogin(option)
    } catch {
      // The app-level login handler owns the visible error message.
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <main className={selectedPortal === 'super-admin' ? 'auth-shell super-admin-shell' : 'auth-shell'}>
      <section className="auth-hero" aria-label="GymFlow login">
        <div className="brand auth-brand">
          <div className="brand-mark">
            <AppIcon name={selectedPortal === 'super-admin' ? 'shield' : 'dumbbell'} size={24} />
          </div>
          <div>
            <strong>{selectedPortal === 'super-admin' ? 'GymFlow HQ' : 'GymFlow'}</strong>
            <span>{selectedPortal === 'super-admin' ? 'Platform operations' : 'Tenant gym workspace'}</span>
          </div>
        </div>
        <div>
          <span className="eyebrow">Pakistan · PKR · PKT</span>
          <h1>{selectedPortal === 'super-admin' ? 'Super Admin Portal' : 'Tenant Login'}</h1>
          <p>
            {selectedPortal === 'super-admin'
              ? 'Central login for tenant provisioning, subscriptions, billing controls, and platform audit.'
              : 'Gym login for members, payments, renewals, notifications, reports, and branch operations.'}
          </p>
        </div>
        <div className="auth-stat-grid">
          <div>
            <span>Workspace</span>
            <strong>{featuredOption.workspace}</strong>
          </div>
          <div>
            <span>Login URL</span>
            <strong>{featuredOption.url}</strong>
          </div>
          <div>
            <span>Access</span>
            <strong>{selectedPortal === 'super-admin' ? 'Central DB' : 'Tenant DB'}</strong>
          </div>
        </div>
      </section>

      <section className="auth-panel panel" aria-label="Sign in">
        <div className="auth-toggle">
          <button
            className={selectedPortal === 'tenant' ? 'selected' : ''}
            onClick={() => setSelectedPortal('tenant')}
            type="button"
          >
            <AppIcon name="dumbbell" size={16} />
            Tenant
          </button>
          <button
            className={selectedPortal === 'super-admin' ? 'selected' : ''}
            onClick={() => setSelectedPortal('super-admin')}
            type="button"
          >
            <AppIcon name="shield" size={16} />
            Super Admin
          </button>
        </div>

        <div className="login-field-stack">
          <label>Login URL<HintInput placeholder="Login URL" detail={featuredOption.url} /></label>
          <label>Email<HintInput placeholder="Email address" detail={selectedPortal === 'super-admin' ? 'ops@gymflow.pk' : 'admin@fitzone.pk'} /></label>
          <label>Password<HintInput placeholder="Password" detail="Use the demo credential shared for this portal." /></label>
        </div>

        <div className="api-source-toggle" aria-label="Data source">
          <span>Data source</span>
          <div>
            <button
              className={apiMode === 'backend' ? 'selected' : ''}
              onClick={() => onApiModeChange('backend')}
              type="button"
            >
              Server API
            </button>
            {allowMockMode && (
              <button
                className={apiMode === 'mock' ? 'selected' : ''}
                onClick={() => onApiModeChange('mock')}
                type="button"
              >
                Demo mock
              </button>
            )}
          </div>
          <small>{apiMode === 'backend' ? `Persistent backend · ${gymFlowApi.mode.baseUrl()}` : 'Demo fallback · browser-only data'}</small>
        </div>

        {loginError && <div className="login-error">{loginError}</div>}

        <div className="login-option-list">
          {options.map((option) => (
            <button
              className="login-option"
              disabled={isSigningIn}
              key={option.role}
              onClick={() => handleLogin(option)}
              type="button"
            >
              <span>
                <strong>{option.title}</strong>
                <small>{option.name} · {option.workspace}</small>
              </span>
              {isSigningIn ? <small>Signing in</small> : <AppIcon name="eye" size={17} />}
            </button>
          ))}
        </div>

        <div className="rule-box auth-note">
          <AppIcon name="shield" size={18} />
          <span>{selectedPortal === 'super-admin' ? 'Super Admin never opens tenant member records directly.' : 'Tenant users stay inside their own gym database.'}</span>
        </div>
      </section>
    </main>
  )
}

function Dashboard({
  members,
  session,
  onAddMember,
  onOpenMember,
}: {
  members: Member[]
  session: AuthSession
  onAddMember: () => void
  onOpenMember: (member: Member) => void
}) {
  const [summary, setSummary] = useState<TenantReportSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    gymFlowApi.tenant.getReportSummary(session)
      .then((reportSummary) => {
        if (isMounted) setSummary(reportSummary)
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard metrics.')
      })
    return () => {
      isMounted = false
    }
  }, [session, members])

  const paymentMix = summary?.paymentMethodBreakdown ?? []
  const paymentTotal = paymentMix.reduce((sum, item) => sum + item.amountPkr, 0)
  const paymentBars = paymentMix.map((item, index) => ({
    label: item.method.replace('_', ' '),
    amountPkr: item.amountPkr,
    color: ['#2563eb', '#16a34a', '#d97706', '#7c3aed'][index % 4],
  }))

  function exportCollections() {
    downloadCsv('gymflow-collections-by-method.csv', paymentMix.map((row) => ({
      method: row.method,
      amountPkr: row.amountPkr,
    })))
  }

  function exportPaymentMix() {
    downloadCsv('gymflow-payment-mix.csv', paymentMix.map((row) => ({
      method: row.method,
      amountPkr: row.amountPkr,
      percentage: paymentTotal ? Math.round((row.amountPkr / paymentTotal) * 100) : 0,
    })))
  }

  return (
    <>
      <section className="metric-grid" aria-label="Key metrics">
        <Metric icon="badge" label="Collections" value={formatPKR(summary?.collectionsPkr ?? 0)} trend="Recorded payments in tenant DB" />
        <Metric icon="users" label="Active members" value={String(summary?.activeMembers ?? members.filter((member) => member.status === 'Active').length)} trend="Live member directory" />
        <Metric icon="wallet" label="Outstanding dues" value={formatPKR(summary?.outstandingDuesPkr ?? 0)} trend="Member balances due" />
        <Metric icon="gauge" label="Suspended members" value={String(summary?.suspendedMembers ?? 0)} trend="Tenant lifecycle status" />
      </section>

      {error && (
        <div className="error-banner">
          <AppIcon name="x" size={17} />
          <span>{error}</span>
        </div>
      )}

      <section className="dashboard-grid">
        <div className="panel large">
          <PanelHeader title="Collections by method" action="Export" icon="download" onAction={exportCollections} />
          <RevenueBars items={paymentBars} />
        </div>

        <div className="panel">
          <PanelHeader title="Payment mix" action="Export" icon="download" onAction={exportPaymentMix} />
          <div className="mix-layout">
            <div className="donut" aria-label="Payment mix">
              <span>{paymentTotal ? '100%' : '0%'}</span>
            </div>
            <div className="legend-list">
              {paymentMix.map((item) => (
                <span key={item.method}>
                  <i style={{ background: paymentBars.find((bar) => bar.label === item.method.replace('_', ' '))?.color }} />
                  {item.method.replace('_', ' ')} · {paymentTotal ? Math.round((item.amountPkr / paymentTotal) * 100) : 0}%
                </span>
              ))}
              {paymentMix.length === 0 && <span>No payments recorded yet.</span>}
            </div>
          </div>
        </div>

        <div className="panel">
          <PanelHeader title="Operations feed" action="Audit" icon="list" />
          <div className="activity-list">
            <div className="activity-item">
              <AppIcon name="spark" size={17} />
              <span>{members.length === 0 ? 'No member activity yet. Create the first member to begin the demo flow.' : `${members.length} member records loaded from tenant database.`}</span>
            </div>
          </div>
        </div>
      </section>

      <MembersTable
        members={members.slice(0, 4)}
        compact
        onAddMember={onAddMember}
        onOpenMember={onOpenMember}
      />
    </>
  )
}

function RevenueBars({ items }: { items: Array<{ label: string; amountPkr: number; color: string }> }) {
  if (items.length === 0) {
    return (
      <div className="rule-box">
        <AppIcon name="spark" size={18} />
        <span>No collection data yet.</span>
      </div>
    )
  }

  const maxTotal = Math.max(...items.map((item) => item.amountPkr), 1)

  return (
    <div className="revenue-bars" aria-label="Revenue by channel">
      {items.map((item) => {
        const barHeight = Math.max(12, (item.amountPkr / maxTotal) * 180)
        return (
          <div className="revenue-day" key={item.label}>
            <div className="bar-stack">
              <span className="bar cash" style={{ height: barHeight, background: item.color }} />
            </div>
            <small>{item.label}</small>
          </div>
        )
      })}
    </div>
  )
}

function MembersTable({
  members: rows,
  compact = false,
  onAddMember,
  onOpenMember,
}: {
  members: Member[]
  compact?: boolean
  onAddMember: () => void
  onOpenMember: (member: Member) => void
}) {
  return (
    <section className="panel table-panel">
      <PanelHeader
        title={compact ? 'Members needing attention' : 'Member directory'}
        action="Add member"
        icon="plus"
        onAction={onAddMember}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Plan</th>
              <th>Due date</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Last payment</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => (
              <tr key={member.id}>
                <td>
                  <div className="member-cell">
                    <strong>{member.name}</strong>
                    <span>{member.id} · {member.phone}</span>
                  </div>
                </td>
                <td>{member.plan}<span className="subtle-cell">{member.branch}</span></td>
                <td>{member.dueDate}</td>
                <td>{member.balance ? formatPKR(member.balance) : 'Clear'}</td>
                <td><StatusBadge status={member.status} /></td>
                <td>{member.lastPayment}</td>
                <td>
                  <button
                    className="icon-button small"
                    type="button"
                    aria-label={`Open profile for ${member.name}`}
                    onClick={() => onOpenMember(member)}
                  >
                    <AppIcon name="eye" size={17} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>No members yet. Add the first member to begin.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MemberDrawer({
  member,
  session,
  onClose,
  onCollectFee,
  onUpdate,
}: {
  member: Member
  session: AuthSession
  onClose: () => void
  onCollectFee: (member: Member) => void
  onUpdate: (member: Member, input: UpdateMemberInput) => Promise<Member>
}) {
  const [profileTab, setProfileTab] = useState<'overview' | 'payments' | 'notifications' | 'timeline'>('overview')
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<Required<UpdateMemberInput>>({
    name: member.name,
    phone: member.phone,
    branchName: member.branch,
    planName: member.plan,
    dueDate: member.dueDate,
    status: member.status,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [isSendingReminder, setIsSendingReminder] = useState(false)
  const [reminderMessage, setReminderMessage] = useState('')
  const [reminderError, setReminderError] = useState('')

  useEffect(() => {
    setForm({
      name: member.name,
      phone: member.phone,
      branchName: member.branch,
      planName: member.plan,
      dueDate: member.dueDate,
      status: member.status,
    })
  }, [member])

  function updateField(field: keyof Required<UpdateMemberInput>, value: string) {
    setError('')
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Name and phone are required.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await onUpdate(member, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        branchName: form.branchName,
        planName: form.planName,
        dueDate: form.dueDate,
        status: form.status,
      })
      setIsEditing(false)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update member.')
    } finally {
      setIsSaving(false)
    }
  }

  async function sendReminder() {
    setIsSendingReminder(true)
    setReminderError('')
    setReminderMessage('')
    try {
      const result = await gymFlowApi.tenant.sendReminder(session, member)
      setReminderMessage(`Reminder ${result.notification.status} via ${result.notification.channel}.`)
    } catch (reminderIssue) {
      setReminderError(reminderIssue instanceof Error ? reminderIssue.message : 'Unable to queue reminder.')
    } finally {
      setIsSendingReminder(false)
    }
  }

  async function setLifecycleStatus(status: MemberStatus) {
    setIsSaving(true)
    setError('')
    try {
      await onUpdate(member, { status })
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update member status.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <aside className="drawer-backdrop" aria-label="Member profile">
      <div className="drawer">
        <div className="drawer-header">
          <div>
            <span className="eyebrow">Member profile</span>
            <h2>{member.name}</h2>
          </div>
          <div className="drawer-header-actions">
            <button
              className="icon-button small"
              type="button"
              onClick={() => {
                setIsEditing((current) => !current)
                setProfileTab('overview')
              }}
              aria-label={isEditing ? 'Cancel editing' : 'Edit member'}
            >
              <AppIcon name={isEditing ? 'x' : 'settings'} size={17} />
            </button>
            <button className="icon-button small" type="button" onClick={onClose} aria-label="Close profile">
              <AppIcon name="x" size={17} />
            </button>
          </div>
        </div>

        <div className="profile-summary">
          <div>
            <strong>{member.id}</strong>
            <span>{member.phone}</span>
          </div>
          <StatusBadge status={member.status} />
        </div>

        <div className="drawer-tabs" role="tablist" aria-label="Member profile sections">
          {[
            ['overview', 'Overview'],
            ['payments', 'Payments'],
            ['notifications', 'Messages'],
            ['timeline', 'Timeline'],
          ].map(([id, label]) => (
            <button
              className={profileTab === id ? 'active' : ''}
              key={id}
              type="button"
              onClick={() => setProfileTab(id as typeof profileTab)}
            >
              {label}
            </button>
          ))}
        </div>

        {profileTab === 'overview' && (
          <>
            {isEditing ? (
              <form onSubmit={handleSave}>
                <div className="settings-list member-edit-form">
                  <label>Name<input value={form.name} onChange={(event) => updateField('name', event.target.value)} /></label>
                  <label>Phone<input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} /></label>
                  <label>
                    Branch
                    <select value={form.branchName} onChange={(event) => updateField('branchName', event.target.value)}>
                      <option value="Main Branch">Main Branch</option>
                      <option value="DHA Branch">DHA Branch</option>
                      <option value="Gulberg">Gulberg</option>
                    </select>
                  </label>
                  <label>
                    Plan
                    <select value={form.planName} onChange={(event) => updateField('planName', event.target.value)}>
                      <option value="Monthly Basic">Monthly Basic</option>
                      <option value="Monthly Pro">Monthly Pro</option>
                      <option value="Quarterly Elite">Quarterly Elite</option>
                      <option value="Annual Elite">Annual Elite</option>
                    </select>
                  </label>
                  <label>Due date<input value={form.dueDate} onChange={(event) => updateField('dueDate', event.target.value)} /></label>
                  <label>
                    Status
                    <select value={form.status} onChange={(event) => updateField('status', event.target.value as MemberStatus)}>
                      <option value="Active">Active</option>
                      <option value="Balance Due">Balance Due</option>
                      <option value="Dues Pending">Dues Pending</option>
                      <option value="Suspended">Suspended</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </label>
                </div>

                {error && (
                  <div className="error-banner">
                    <AppIcon name="x" size={17} />
                    <span>{error}</span>
                  </div>
                )}

                <div className="drawer-actions">
                  <button className="primary-button full" type="submit" disabled={isSaving}>
                    <AppIcon name="check" size={18} />
                    {isSaving ? 'Saving' : `Save ${session.apiMode === 'backend' ? 'to backend' : 'changes'}`}
                  </button>
                </div>
              </form>
            ) : (
              <div className="profile-grid">
                <InfoTile label="Plan" value={member.plan} />
                <InfoTile label="Branch" value={member.branch} />
                <InfoTile label="Due date" value={member.dueDate} />
                <InfoTile label="Balance" value={member.balance ? formatPKR(member.balance) : 'Clear'} />
              </div>
            )}

            {!isEditing && (
              <>
                <div className="rule-box">
                  <AppIcon name="spark" size={18} />
                  <span>
                    Partial payments keep this member active. Full clearance extends the billing cycle.
                  </span>
                </div>

                <div className="drawer-actions">
                  <button className="primary-button full" type="button" onClick={() => onCollectFee(member)}>
                    <AppIcon name="credit" size={18} />
                    Collect fee
                  </button>
                  <button className="ghost-button full" type="button" onClick={sendReminder} disabled={isSendingReminder}>
                    <AppIcon name="message" size={17} />
                    {isSendingReminder ? 'Queueing reminder' : 'Send reminder'}
                  </button>
                </div>
                <div className="drawer-actions lifecycle-actions">
                  {member.status !== 'Suspended' && (
                    <button className="ghost-button full" type="button" onClick={() => setLifecycleStatus('Suspended')} disabled={isSaving}>
                      <AppIcon name="shield" size={17} />
                      Suspend
                    </button>
                  )}
                  {member.status !== 'Active' && (
                    <button className="ghost-button full" type="button" onClick={() => setLifecycleStatus('Active')} disabled={isSaving}>
                      <AppIcon name="check" size={17} />
                      Reactivate
                    </button>
                  )}
                  {member.status !== 'Cancelled' && (
                    <button className="ghost-button full danger" type="button" onClick={() => setLifecycleStatus('Cancelled')} disabled={isSaving}>
                      <AppIcon name="x" size={17} />
                      Cancel
                    </button>
                  )}
                </div>
                {reminderMessage && (
                  <div className="success-banner">
                    <AppIcon name="check" size={17} />
                    <span>{reminderMessage}</span>
                  </div>
                )}
                {reminderError && (
                  <div className="error-banner">
                    <AppIcon name="x" size={17} />
                    <span>{reminderError}</span>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {profileTab === 'payments' && <ProfilePayments member={member} />}
        {profileTab === 'notifications' && <ProfileNotifications member={member} />}
        {profileTab === 'timeline' && <ProfileTimeline member={member} />}
      </div>
    </aside>
  )
}

function ProfilePayments({ member }: { member: Member }) {
  return (
    <div className="profile-list">
      <div className="profile-list-row">
        <AppIcon name="receipt" size={18} />
        <div>
          <strong>{member.lastPayment ? 'Latest payment recorded' : 'No payments recorded yet'}</strong>
          <span>{member.lastPayment || 'Payment history will appear after fee collection.'}</span>
        </div>
        <b>{member.balance ? formatPKR(member.balance) : 'Clear'}</b>
      </div>
    </div>
  )
}

function ProfileNotifications({ member }: { member: Member }) {
  return (
    <div className="profile-list">
      <div className="profile-list-row">
        <AppIcon name="message" size={18} />
        <div>
          <strong>No member notifications yet</strong>
          <span>Queued reminders and payment confirmations will appear in the Notifications module.</span>
        </div>
        <b>{member.status}</b>
      </div>
    </div>
  )
}

function ProfileTimeline({ member }: { member: Member }) {
  return (
    <div className="timeline expanded">
      <h3>Timeline</h3>
      <span>Member status · {member.status}</span>
      <span>Current due date · {member.dueDate || 'Not set'}</span>
      <span>{member.lastPayment ? `Latest payment · ${member.lastPayment}` : 'No payments recorded yet'}</span>
      <span>Audit entries appear after updates, payments, and reminders.</span>
    </div>
  )
}

function AddMemberModal({
  session,
  onClose,
  onCreate,
}: {
  session: AuthSession
  onClose: () => void
  onCreate: (input: CreateMemberInput) => Promise<Member>
}) {
  const [form, setForm] = useState<CreateMemberInput>({
    name: '',
    phone: '',
    branchName: '',
    planName: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdMember, setCreatedMember] = useState<Member | null>(null)
  const selectedPlanPrice = form.planName ? getPlanPrice(form.planName) : 0

  function updateField(field: keyof CreateMemberInput, value: string) {
    setError('')
    setCreatedMember(null)
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim() || !form.phone.trim() || !form.branchName || !form.planName) {
      setError('Full name, phone, branch, and plan are required.')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const member = await onCreate({
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim(),
      })
      setCreatedMember(member)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create member.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add member">
      <div className="modal">
        <div className="drawer-header">
          <div>
            <span className="eyebrow">Enrollment</span>
            <h2>Add new member</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onClose} aria-label="Close add member">
            <AppIcon name="x" size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Full name
              <input value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Member full name" title="Enter the member's full legal or display name." />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} placeholder="Phone number" title="Use the member's WhatsApp/SMS reachable number." />
            </label>
            <label>
              Branch
              <select value={form.branchName} onChange={(event) => updateField('branchName', event.target.value)} title="Select the branch where this member is registered.">
                <option value="" disabled>Select branch</option>
                <option value="Main Branch">Main Branch</option>
                <option value="DHA Branch">DHA Branch</option>
                <option value="Gulberg">Gulberg</option>
              </select>
            </label>
            <label>
              Plan
              <select value={form.planName} onChange={(event) => updateField('planName', event.target.value)} title="Select the membership plan for billing and renewal calculation.">
                <option value="" disabled>Select plan</option>
                <option value="Monthly Basic">Monthly Basic</option>
                <option value="Monthly Pro">Monthly Pro</option>
                <option value="Quarterly Elite">Quarterly Elite</option>
                <option value="Annual Elite">Annual Elite</option>
              </select>
            </label>
          </div>

          <div className="enrollment-preview">
            <AppIcon name="user-plus" size={18} />
            <span>{form.planName ? `${form.planName} starts active with ${formatPKR(selectedPlanPrice)} outstanding.` : 'Select a plan to preview the first outstanding amount.'}</span>
          </div>

          {error && (
            <div className="error-banner">
              <AppIcon name="x" size={17} />
              <span>{error}</span>
            </div>
          )}

          {createdMember && (
            <div className="success-banner">
              <AppIcon name="check" size={17} />
              <span>{createdMember.name} created in {session.apiMode === 'backend' ? 'backend' : 'mock'} mode.</span>
            </div>
          )}

          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>Close</button>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              <AppIcon name="user-plus" size={18} />
              {isSubmitting ? 'Creating' : 'Create member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function slugifyTenantName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ProvisionTenantModal({
  session,
  onClose,
  onProvision,
}: {
  session: AuthSession
  onClose: () => void
  onProvision: (input: ProvisionTenantInput) => ReturnType<typeof gymFlowApi.platform.provisionTenant>
}) {
  const [form, setForm] = useState<ProvisionTenantInput>({
    name: '',
    slug: '',
    planCode: '',
    adminName: '',
    adminEmail: '',
    city: '',
    branchName: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Awaited<ReturnType<typeof gymFlowApi.platform.provisionTenant>> | null>(null)

  const domainPreview = form.slug ? `${form.slug}.gymflow.pk` : 'tenant.gymflow.pk'
  const planPreview = form.planCode === 'professional' ? 'Professional' : form.planCode === 'growth' ? 'Growth' : 'Select plan'

  function updateField(field: keyof ProvisionTenantInput, value: string) {
    setResult(null)
    setError('')
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim() || !form.slug.trim() || !form.planCode || !form.adminName.trim() || !form.adminEmail.trim()) {
      setError('Gym name, slug, plan, admin name, and admin email are required.')
      return
    }

    setIsSubmitting(true)
    setError('')
    try {
      const provisioned = await onProvision({
        ...form,
        name: form.name.trim(),
        slug: slugifyTenantName(form.slug),
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim().toLowerCase(),
        city: form.city.trim(),
        branchName: form.branchName.trim(),
      })
      setResult(provisioned)
    } catch (provisionError) {
      setError(provisionError instanceof Error ? provisionError.message : 'Unable to provision tenant.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Provision tenant">
      <div className="modal tenant-modal">
        <div className="drawer-header">
          <div>
            <span className="eyebrow">Super Admin</span>
            <h2>Onboard gym</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onClose} aria-label="Close tenant provisioning">
            <AppIcon name="x" size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label>
              Gym name
              <input
                value={form.name}
                onChange={(event) => {
                  const nextName = event.target.value
                  setResult(null)
                  setError('')
                  setForm((current) => ({
                    ...current,
                    name: nextName,
                    slug: current.slug ? current.slug : slugifyTenantName(nextName),
                  }))
                }}
                placeholder="Gym name"
                title="Enter the client gym or tenant workspace name."
              />
            </label>
            <label>
              Slug
              <input
                value={form.slug}
                onChange={(event) => updateField('slug', slugifyTenantName(event.target.value))}
                placeholder="tenant-slug"
                title="Lowercase tenant identifier used for routing and database naming."
              />
            </label>
            <label>
              Plan
              <select value={form.planCode} onChange={(event) => updateField('planCode', event.target.value)} title="Choose the platform subscription plan for this tenant.">
                <option value="" disabled>Select plan</option>
                <option value="growth">Growth</option>
                <option value="professional">Professional</option>
              </select>
            </label>
            <label>
              City
              <input value={form.city} onChange={(event) => updateField('city', event.target.value)} placeholder="City" title="City used for the tenant's first branch profile." />
            </label>
            <label>
              Admin name
              <input value={form.adminName} onChange={(event) => updateField('adminName', event.target.value)} placeholder="Admin full name" title="Name of the first tenant administrator." />
            </label>
            <label>
              Admin email
              <input value={form.adminEmail} onChange={(event) => updateField('adminEmail', event.target.value)} placeholder="Admin email" title="Email address used by the first tenant administrator." />
            </label>
            <label className="wide-field">
              First branch
              <input value={form.branchName} onChange={(event) => updateField('branchName', event.target.value)} placeholder="First branch name" title="Name of the first branch created during provisioning." />
            </label>
          </div>

          <div className="enrollment-preview provision-preview">
            <AppIcon name="building" size={18} />
            <span>{domainPreview} · {planPreview} · {form.branchName || 'First branch'}</span>
          </div>

          {error && (
            <div className="error-banner">
              <AppIcon name="x" size={17} />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="success-banner">
              <AppIcon name="check" size={17} />
              <span>{result.tenant.name} provisioned · {result.job.status} · {result.job.step.replaceAll('_', ' ')}</span>
            </div>
          )}

          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>Close</button>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              <AppIcon name="plus" size={18} />
              {isSubmitting ? 'Provisioning' : session.apiMode === 'backend' ? 'Create tenant' : 'Preview tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TenantStatusModal({
  tenant,
  session,
  onClose,
  onUpdateStatus,
}: {
  tenant: TenantSummary
  session: AuthSession
  onClose: () => void
  onUpdateStatus: (tenant: TenantSummary, status: PlatformTenantStatus) => Promise<TenantSummary>
}) {
  const [isSubmitting, setIsSubmitting] = useState<PlatformTenantStatus | null>(null)
  const [error, setError] = useState('')
  const [updatedStatus, setUpdatedStatus] = useState<PlatformTenantStatus | null>(null)
  const statusActions: Array<{ status: PlatformTenantStatus; label: string; detail: string }> = [
    { status: 'Active', label: 'Activate', detail: 'Tenant can use the platform normally.' },
    { status: 'Trial', label: 'Move to trial', detail: 'Tenant remains active with trial status.' },
    { status: 'Suspended', label: 'Suspend', detail: 'Tenant access can be restricted by future auth policy.' },
    { status: 'Cancelled', label: 'Cancel', detail: 'Tenant stays archived in central records.' },
  ]

  async function updateStatus(status: PlatformTenantStatus) {
    setIsSubmitting(status)
    setError('')
    try {
      const updatedTenant = await onUpdateStatus(tenant, status)
      setUpdatedStatus(updatedTenant.status)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update tenant status.')
    } finally {
      setIsSubmitting(null)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Manage tenant">
      <div className="modal tenant-modal">
        <div className="drawer-header">
          <div>
            <span className="eyebrow">Super Admin</span>
            <h2>{tenant.name}</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onClose} aria-label="Close tenant controls">
            <AppIcon name="x" size={17} />
          </button>
        </div>

        <div className="profile-summary">
          <div>
            <strong>{tenant.slug}</strong>
            <span>{tenant.plan} · {tenant.members.toLocaleString('en-PK')} members · {formatPKR(tenant.revenue)}</span>
          </div>
          <span className={`log-status ${tenant.status === 'Active' ? 'delivered' : 'sent'}`}>{tenant.status}</span>
        </div>

        <div className="profile-grid tenant-detail-grid">
          <InfoTile label="Domain" value={tenant.primaryDomain} />
          <InfoTile label="Database" value={tenant.databaseName} />
          <InfoTile label="Provisioning" value={tenant.provisioningStatus} />
          <InfoTile label="Plan" value={tenant.plan} />
        </div>

        <div className="tenant-action-grid">
          {statusActions.map((action) => (
            <button
              className={tenant.status === action.status ? 'tenant-action selected' : 'tenant-action'}
              key={action.status}
              type="button"
              onClick={() => updateStatus(action.status)}
              disabled={isSubmitting !== null || tenant.status === action.status}
            >
              <strong>{isSubmitting === action.status ? 'Updating' : action.label}</strong>
              <span>{action.detail}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="error-banner">
            <AppIcon name="x" size={17} />
            <span>{error}</span>
          </div>
        )}

        {updatedStatus && (
          <div className="success-banner">
            <AppIcon name="check" size={17} />
            <span>{tenant.name} moved to {updatedStatus} in {session.apiMode === 'backend' ? 'backend' : 'mock'} mode.</span>
          </div>
        )}

        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function HintInput({ placeholder, detail }: { placeholder: string; detail?: string }) {
  return (
    <input
      value=""
      readOnly
      placeholder={placeholder}
      title={detail ?? placeholder}
      aria-label={placeholder}
    />
  )
}

function PaymentsView({
  members,
  session,
  initialSelectedMemberId,
  onMembersChange,
}: {
  members: Member[]
  session: AuthSession
  initialSelectedMemberId: string
  onMembersChange: (members: Member[]) => void
}) {
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState(initialSelectedMemberId || members[0]?.id || '')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('easypaisa')
  const [amountPaid, setAmountPaid] = useState('')
  const [discount, setDiscount] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [payments, setPayments] = useState<TenantPayment[]>([])

  const paymentCandidates = useMemo(() => {
    const needle = memberSearch.toLowerCase().trim()
    if (!needle) return members
    return members.filter((member) =>
      [member.name, member.id, member.phone, member.branch, member.status]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [memberSearch, members])

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? members[0]
  const hasMembers = members.length > 0
  const selectedMemberSafe = selectedMember ?? {
    id: '',
    name: 'No member selected',
    phone: '',
    branch: '',
    plan: 'Monthly Basic',
    dueDate: '',
    balance: 0,
    status: 'Active' as const,
    lastPayment: '',
  }
  const planPrice = getPlanPrice(selectedMemberSafe.plan)
  const lateFee = selectedMemberSafe.status === 'Dues Pending' || selectedMemberSafe.status === 'Suspended' ? 200 : 0
  const currentOutstanding = selectedMember ? selectedMemberSafe.balance || planPrice : 0
  const paid = Number(amountPaid) || 0
  const discountAmount = Number(discount) || 0
  const amountDue = Math.max(0, currentOutstanding + lateFee - discountAmount)
  const outstandingAfter = Math.max(0, amountDue - paid)
  const paymentType = outstandingAfter > 0 ? 'Partial' : 'Full'
  const willExtend = outstandingAfter === 0
  const requiresTransactionId = paymentMethod !== 'cash'
  const latestPayment = payments[0]

  useEffect(() => {
    let isMounted = true
    gymFlowApi.tenant.getPayments(session)
      .then((paymentRows) => {
        if (isMounted) setPayments(paymentRows)
      })
      .catch((loadError) => {
        if (isMounted) setPaymentError(loadError instanceof Error ? loadError.message : 'Unable to load payment history.')
      })
    return () => {
      isMounted = false
    }
  }, [session])

  useEffect(() => {
    const nextSelectedId = initialSelectedMemberId || selectedMemberId || members[0]?.id || ''
    const nextMember = members.find((member) => member.id === nextSelectedId)
    if (!nextMember) return
    if (nextMember.id === selectedMemberId) return

    setSelectedMemberId(nextMember.id)
    setAmountPaid('')
    setDiscount('')
    setTransactionId('')
    setPaymentError('')
    setIsConfirmed(false)
  }, [amountPaid, initialSelectedMemberId, members, selectedMemberId])

  function selectMember(memberId: string) {
    const nextMember = members.find((member) => member.id === memberId) ?? members[0]
    if (!nextMember) return
    setSelectedMemberId(memberId)
    setAmountPaid('')
    setDiscount('')
    setTransactionId('')
    setPaymentError('')
    setIsConfirmed(false)
  }

  async function confirmPayment() {
    if (!selectedMember || paid <= 0) {
      setPaymentError('Select a member and enter a valid payment amount.')
      return
    }
    if (requiresTransactionId && !transactionId.trim()) {
      setPaymentError('Transaction ID is required for digital payments.')
      return
    }
    setIsSubmitting(true)
    setPaymentError('')
    try {
      const result = await gymFlowApi.tenant.createPayment(session, {
        member: selectedMemberSafe,
        amountPaidPkr: paid,
        discountPkr: discountAmount,
        lateFeePkr: lateFee,
        method: paymentMethod,
        transactionId: transactionId || undefined,
      })
      onMembersChange(await gymFlowApi.tenant.getMembers(session))
      setPayments(await gymFlowApi.tenant.getPayments(session))
      setIsConfirmed(true)
      if (result.payment) {
        setTransactionId(result.payment.transactionId ?? '')
      }
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Unable to record payment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="payment-workflow">
      <div className="panel">
        <PanelHeader title="Collect fee" action="Receipt" icon="receipt" />
        <div className="payment-card">
          <div className="workflow-step">
            <span>1</span>
            <div>
              <strong>Select member</strong>
              <small>Search by name, phone, ID, branch, or status.</small>
            </div>
          </div>

          <label className="search-box payment-search">
            <AppIcon name="search" size={18} />
            <input
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder="Search member for fee collection"
            />
          </label>

          <div className="member-picker">
            {paymentCandidates.slice(0, 4).map((member) => (
              <button
                className={member.id === selectedMemberSafe.id ? 'member-option selected' : 'member-option'}
                key={member.id}
                type="button"
                onClick={() => selectMember(member.id)}
              >
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.id} · {member.plan}</span>
                </div>
                <StatusBadge status={member.status} />
              </button>
            ))}
            {paymentCandidates.length === 0 && (
              <div className="rule-box">
                <AppIcon name="spark" size={18} />
                <span>{members.length === 0 ? 'No members yet. Add a member before collecting payment.' : 'No members match this search.'}</span>
              </div>
            )}
          </div>

          <div className="person-summary">
            <div>
              <strong>{selectedMemberSafe.name}</strong>
              <span>{selectedMemberSafe.plan} · {selectedMemberSafe.branch}</span>
            </div>
            <b>{formatPKR(amountDue)} due</b>
          </div>

          <div className="workflow-step">
            <span>2</span>
            <div>
              <strong>Review amount</strong>
              <small>Partial payment stays active. Full clearance extends expiry.</small>
            </div>
          </div>

          <div className="form-grid">
            <label>Current outstanding<HintInput placeholder={selectedMember ? formatPKR(currentOutstanding) : 'Select member'} detail={selectedMember ? `Current outstanding is ${formatPKR(currentOutstanding)}.` : 'Select a member to calculate outstanding dues.'} /></label>
            <label>Late fee<HintInput placeholder={selectedMember ? formatPKR(lateFee) : 'Select member'} detail={selectedMember ? `Late fee is ${formatPKR(lateFee)}.` : 'Select a member to calculate late fee.'} /></label>
            <label>Discount<input value={discount} onChange={(event) => setDiscount(event.target.value)} inputMode="numeric" placeholder="Discount amount" title="Optional discount amount in PKR. Leave empty for zero discount." /></label>
            <label>Amount paid<input value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} inputMode="numeric" placeholder={selectedMember ? formatPKR(currentOutstanding) : 'Amount paid'} title={selectedMember ? `Suggested full payment is ${formatPKR(currentOutstanding)}.` : 'Enter the payment amount collected.'} /></label>
            <label>Method
              <select
                value={paymentMethod}
                onChange={(event) => {
                  setPaymentMethod(event.target.value as PaymentMethod)
                  setIsConfirmed(false)
                }}
              >
                <option value="cash">Cash</option>
                <option value="easypaisa">EasyPaisa</option>
                <option value="jazzcash">JazzCash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </label>
            <label>{requiresTransactionId ? 'Transaction ID' : 'Transaction ID optional'}
              <input
                value={transactionId}
                onChange={(event) => setTransactionId(event.target.value)}
                placeholder={requiresTransactionId ? 'Required for digital payments' : 'Not required for cash'}
                title={requiresTransactionId ? 'Enter gateway transaction/reference ID for digital payments.' : 'Cash payments can be recorded without a transaction ID.'}
              />
            </label>
          </div>

          <div className={willExtend ? 'payment-preview full-clearance' : 'payment-preview partial'}>
            <div>
              <span>Payment type</span>
              <strong>{paymentType}</strong>
            </div>
            <div>
              <span>Outstanding after</span>
              <strong>{formatPKR(outstandingAfter)}</strong>
            </div>
            <div>
              <span>Expiry</span>
              <strong>{willExtend ? 'Extends' : 'Unchanged'}</strong>
            </div>
          </div>

          <div className="rule-box">
            <AppIcon name="spark" size={18} />
            <span>
              Any payment keeps membership active. {willExtend ? 'This payment clears the cycle.' : 'This is a partial payment; balance remains visible.'}
            </span>
          </div>

          {isConfirmed && (
            <div className="success-banner">
              <AppIcon name="check" size={18} />
              <span>Receipt generated. WhatsApp and SMS confirmation queued.</span>
            </div>
          )}

          {paymentError && <div className="login-error">{paymentError}</div>}

          <button className="primary-button full" type="button" onClick={confirmPayment} disabled={isSubmitting || !hasMembers}>
            <AppIcon name="credit" size={18} />
            {isSubmitting ? 'Recording payment' : 'Confirm and generate receipt'}
          </button>
        </div>
      </div>
      <div className="panel">
        <PanelHeader title="Receipt preview" action="Print" icon="receipt" />
        <div className="receipt-preview">
          <div className="receipt-head">
            <div>
              <span>{session.workspace}</span>
              <strong>{latestPayment?.receiptNo ?? 'Draft receipt'}</strong>
            </div>
            <AppIcon name="receipt" size={28} />
          </div>
          <div className="receipt-lines">
            <ReceiptLine label="Member" value={selectedMemberSafe.name} />
            <ReceiptLine label="Member ID" value={selectedMemberSafe.id} />
            <ReceiptLine label="Plan" value={selectedMemberSafe.plan} />
            <ReceiptLine label="Payment method" value={paymentMethod.replace('_', ' ')} />
            <ReceiptLine label="Plan/outstanding" value={formatPKR(currentOutstanding)} />
            <ReceiptLine label="Late fee" value={formatPKR(lateFee)} />
            <ReceiptLine label="Discount" value={`-${formatPKR(discountAmount)}`} />
            <ReceiptLine label="Amount paid" value={formatPKR(paid)} />
          </div>
          <div className="receipt-total">
            <span>Outstanding after</span>
            <strong>{formatPKR(outstandingAfter)}</strong>
          </div>
          <div className="receipt-note">
            {willExtend
              ? 'Full clearance: expiry will extend and next cycle balance resets.'
              : 'Partial payment: membership remains active and expiry is unchanged.'}
          </div>
        </div>

        <div className="receipt-list compact-receipts">
          {payments.slice(0, 3).map((payment) => {
            const member = members.find((memberRow) => memberRow.sourceId === payment.memberId || memberRow.id === payment.memberId)
            return (
              <div className="receipt-row" key={payment.id}>
                <AppIcon name="receipt" size={18} />
                <div>
                  <strong>{payment.receiptNo}</strong>
                  <span>{member?.name ?? 'Member'} · {formatDateLabel(payment.collectedAt)}</span>
                </div>
                <b>{formatPKR(payment.amountPaidPkr)}</b>
              </div>
            )
          })}
          {payments.length === 0 && (
            <div className="receipt-row">
              <AppIcon name="receipt" size={18} />
              <div>
                <strong>No receipts yet</strong>
                <span>Confirmed payments will appear here.</span>
              </div>
              <b>{formatPKR(0)}</b>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function RenewalsView({
  session,
  onMembersRefresh,
}: {
  session: AuthSession
  onMembersRefresh: (members: Member[]) => void
}) {
  const [queue, setQueue] = useState<RenewalQueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyMemberId, setBusyMemberId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    gymFlowApi.tenant.getRenewals(session)
      .then((renewals) => {
        if (isMounted) setQueue(renewals)
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load renewals.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [session])

  async function updateRenewal(item: RenewalQueueItem, action: 'paid' | 'overdue' | 'reminder_queued') {
    setBusyMemberId(item.memberId)
    setError('')
    try {
      const result = await gymFlowApi.tenant.updateRenewal(session, item, action)
      setQueue((current) => current.map((renewal) => renewal.memberId === item.memberId ? result.renewal : renewal))
      onMembersRefresh(await gymFlowApi.tenant.getMembers(session))
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update renewal.')
    } finally {
      setBusyMemberId('')
    }
  }

  function exportRenewals() {
    downloadCsv('gymflow-renewal-queue.csv', queue.map((item) => ({
      member: item.memberName,
      memberCode: item.memberCode,
      branch: item.branchName,
      plan: item.planName,
      dueDate: formatDateLabel(item.dueDate),
      amountPkr: item.amountPkr,
      memberStatus: item.memberStatus,
      renewalStatus: item.renewalStatus,
      recommendedAction: item.recommendedAction,
    })))
  }

  async function bulkQueueReminders() {
    const actionable = queue.filter((item) => item.renewalStatus !== 'paid')
    if (actionable.length === 0) return
    setBusyMemberId('__bulk__')
    setError('')
    try {
      const updatedQueue = await Promise.all(actionable.map(async (item) => {
        const action = item.memberStatus === 'Active' ? 'reminder_queued' : 'overdue'
        const result = await gymFlowApi.tenant.updateRenewal(session, item, action)
        return result.renewal
      }))
      setQueue((current) => current.map((item) => updatedQueue.find((updated) => updated.memberId === item.memberId) ?? item))
      onMembersRefresh(await gymFlowApi.tenant.getMembers(session))
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to queue bulk reminders.')
    } finally {
      setBusyMemberId('')
    }
  }

  const dueWithin7 = queue.filter((item) => item.renewalStatus === 'overdue' || item.renewalStatus === 'reminder_queued').length
  const overdueCount = queue.filter((item) => item.renewalStatus === 'overdue').length
  const renewalBars = [
    { window: '7d', members: dueWithin7 },
    { window: '14d', members: Math.max(dueWithin7, Math.ceil(queue.length * 0.65)) },
    { window: '30d', members: queue.length },
  ]
  const automationPlan = [
    { trigger: 'expiry_7d', count: queue.filter((item) => item.renewalStatus !== 'paid').length, channel: 'WhatsApp + SMS', time: '8:00 AM' },
    { trigger: 'expiry_3d', count: queue.filter((item) => item.renewalStatus === 'reminder_queued').length, channel: 'WhatsApp + SMS', time: '8:00 AM' },
    { trigger: 'due_today', count: overdueCount, channel: 'WhatsApp + SMS', time: '8:00 AM' },
    { trigger: 'overdue_1d', count: overdueCount, channel: 'WhatsApp + SMS', time: '8:00 AM' },
  ]

  return (
    <>
      <section className="renewal-summary">
        <div className="panel renewal-hero">
          <PanelHeader title="Renewal workload" action="Export" icon="download" onAction={exportRenewals} />
          <div className="renewal-hero-content">
            <div>
              <span className="eyebrow">Next 30 days</span>
              <strong>{isLoading ? 'Loading' : `${queue.length} renewals`}</strong>
              <p>{dueWithin7} members need near-term follow-up. {overdueCount} already need overdue action.</p>
            </div>
            <div className="chart-frame compact-chart">
              <div className="renewal-bars">
                {renewalBars.map((item) => (
                  <div className="renewal-bar-row" key={item.window}>
                    <span>{item.window}</span>
                    <div><i style={{ width: `${Math.min(100, item.members || 4)}%` }} /></div>
                    <b>{item.members}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <PanelHeader title="Automation plan" action="Templates" icon="bell" />
          <div className="reminder-list">
            {automationPlan.map((item) => (
              <div className="reminder-row" key={item.trigger}>
                <div>
                  <strong>{item.trigger}</strong>
                  <span>{item.channel} · {item.time}</span>
                </div>
                <b>{item.count}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel table-panel">
        <PanelHeader title="Renewal queue" action={busyMemberId === '__bulk__' ? 'Queuing' : 'Bulk reminder'} icon="message" onAction={bulkQueueReminders} />
        {error && (
          <div className="error-banner">
            <AppIcon name="x" size={17} />
            <span>{error}</span>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th>Due</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Recommended action</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item) => (
                <tr key={item.memberId}>
                  <td>
                    <strong>{item.memberName}</strong>
                    <span className="subtle-cell">{item.memberCode} · {item.branchName}</span>
                  </td>
                  <td>{item.planName}</td>
                  <td>{formatDateLabel(item.dueDate)}</td>
                  <td>{formatPKR(item.amountPkr)}</td>
                  <td><StatusBadge status={item.memberStatus} /></td>
                  <td>
                    <div className="table-action-row">
                      <button
                        className="ghost-button table-action"
                        type="button"
                        onClick={() => updateRenewal(item, item.memberStatus === 'Active' ? 'reminder_queued' : 'overdue')}
                        disabled={busyMemberId === item.memberId}
                      >
                        {busyMemberId === item.memberId ? 'Updating' : item.recommendedAction}
                      </button>
                      <button
                        className="ghost-button table-action"
                        type="button"
                        onClick={() => updateRenewal(item, 'paid')}
                        disabled={busyMemberId === item.memberId}
                      >
                        Mark paid
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && queue.length === 0 && (
                <tr>
                  <td colSpan={6}>No renewals need action.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <PanelHeader title="Lifecycle rules" action="Review" icon="shield" />
          <div className="rule-stack">
            <span>Full on time: extend from old end date.</span>
            <span>Full late: extend from today.</span>
            <span>Partial: active, no expiry extension.</span>
            <span>No payment after grace: suspend.</span>
          </div>
        </div>
        <div className="panel">
          <PanelHeader title="Staff guidance" action="Open SOP" icon="list" />
          <div className="rule-stack">
            <span>Start with dues pending members before upcoming renewals.</span>
            <span>Use SMS fallback when WhatsApp opt-out is active.</span>
            <span>Record partial payments immediately to protect membership status.</span>
          </div>
        </div>
      </section>
    </>
  )
}

function NotificationsView({ session }: { session: AuthSession }) {
  const [logs, setLogs] = useState<NotificationLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [retryingId, setRetryingId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    gymFlowApi.tenant.getNotifications(session)
      .then((notificationsData) => {
        if (isMounted) setLogs(notificationsData)
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load notifications.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [session])

  async function retryLog(notification: NotificationLog) {
    setRetryingId(notification.id)
    setError('')
    try {
      const result = await gymFlowApi.tenant.retryNotification(session, notification)
      setLogs((current) => [result.notification, ...current])
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Unable to retry notification.')
    } finally {
      setRetryingId('')
    }
  }

  const failedLogs = logs.filter((log) => log.status === 'failed')
  const deliveredCount = logs.filter((log) => log.status === 'delivered').length
  const queuedCount = logs.filter((log) => log.status === 'queued').length

  return (
    <>
      <section className="metric-grid" aria-label="Notification metrics">
        <Metric icon="message" label="Logs" value={isLoading ? 'Loading' : String(logs.length)} trend="Tenant delivery history" />
        <Metric icon="check" label="Delivered" value={String(deliveredCount)} trend="Provider confirmed" />
        <Metric icon="bell" label="Queued" value={String(queuedCount)} trend="Waiting for worker/provider" />
        <Metric icon="shield" label="Failed" value={String(failedLogs.length)} trend="Retry queue needs review" />
      </section>

      <section className="notification-grid">
        <div className="panel notification-templates">
          <PanelHeader title="Tenant templates" action="Test send" icon="message" />
          <div className="template-grid">
            {notificationTemplates.map((template) => (
              <div className="template-card" key={template.trigger}>
                <div>
                  <strong>{template.trigger}</strong>
                  <span>{template.purpose}</span>
                </div>
                <div className="channel-row">
                  <ChannelPill label="WhatsApp" enabled={template.whatsapp} />
                  <ChannelPill label="SMS" enabled={template.sms} />
                  <ChannelPill label="Email" enabled={template.email} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <PanelHeader title="Retry queue" action="Retry all" icon="bell" />
          {error && (
            <div className="error-banner">
              <AppIcon name="x" size={17} />
              <span>{error}</span>
            </div>
          )}
          <div className="profile-list notification-list">
            {(failedLogs.length ? failedLogs : logs.filter((log) => log.status === 'queued')).map((item) => (
              <div className="profile-list-row" key={item.id}>
                <AppIcon name="message" size={18} />
                <div>
                  <strong>{item.memberName}</strong>
                  <span>{item.triggerCode} · {item.channel.toUpperCase()} · {item.failureReason ?? item.status}</span>
                </div>
                <button
                  className="ghost-button table-action"
                  type="button"
                  onClick={() => retryLog(item)}
                  disabled={retryingId === item.id}
                >
                  {retryingId === item.id ? 'Retrying' : 'Retry'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="notification-grid lower">
        <div className="panel table-panel">
          <PanelHeader title="Delivery log" action="Filter" icon="filter" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Trigger</th><th>Channel</th><th>Member</th><th>Status</th><th>Time</th><th></th></tr>
              </thead>
              <tbody>
                {logs.map((item) => (
                  <tr key={item.id}>
                    <td>{item.triggerCode}</td>
                    <td>{item.channel.toUpperCase()}</td>
                    <td>{item.memberName}</td>
                    <td><span className={`log-status ${item.status}`}>{item.status}</span></td>
                    <td>{formatDateLabel(item.createdAt)}</td>
                    <td><button className="ghost-button table-action" type="button">Open</button></td>
                  </tr>
                ))}
                {!isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={6}>No notification logs yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <PanelHeader title="Opt-outs and fallback" action="Review" icon="shield" />
          <div className="profile-list">
            <div className="empty-state compact">No opt-outs recorded yet.</div>
          </div>
          <div className="rule-box notification-note">
            <AppIcon name="spark" size={18} />
            <span>Email templates remain inactive for MVP. Tenant messages use WhatsApp and SMS only.</span>
          </div>
        </div>
      </section>
    </>
  )
}

function ChannelPill({ label, enabled }: { label: string; enabled: boolean }) {
  return <span className={enabled ? 'channel-pill enabled' : 'channel-pill disabled'}>{label}</span>
}

function SuperAdminView({
  activePage,
  session,
  tenants,
  onProvisionTenant,
  onManageTenant,
  onTenantsChange,
}: {
  activePage: SuperAdminPage
  session: AuthSession
  tenants: TenantSummary[]
  onProvisionTenant: () => void
  onManageTenant: (tenant: TenantSummary) => void
  onTenantsChange: (tenants: TenantSummary[]) => void
}) {
  const [stats, setStats] = useState<PlatformTenantStats[]>([])

  useEffect(() => {
    let isMounted = true
    gymFlowApi.platform.getTenantStats(session)
      .then((tenantStats) => {
        if (isMounted) setStats(tenantStats)
      })
      .catch(() => {
        if (isMounted) setStats([])
      })
    return () => {
      isMounted = false
    }
  }, [session, tenants])

  if (activePage === 'tenants') {
    return <SuperAdminTenants tenants={tenants} onProvisionTenant={onProvisionTenant} onManageTenant={onManageTenant} />
  }

  if (activePage === 'plans') {
    return <SuperAdminPlans session={session} tenants={tenants} onTenantsChange={onTenantsChange} />
  }

  if (activePage === 'provisioning') {
    return <SuperAdminProvisioning onProvisionTenant={onProvisionTenant} />
  }

  if (activePage === 'platform-settings') {
    return <SuperAdminSettings session={session} />
  }

  const activeTenants = tenants.filter((tenant) => tenant.status === 'Active').length
  const suspendedTenants = tenants.filter((tenant) => tenant.status === 'Suspended' || tenant.status === 'Cancelled').length
  const totalMembers = stats.reduce((sum, tenantStats) => sum + tenantStats.activeMembers + tenantStats.suspendedMembers, 0)
  const monthlyRevenue = stats.reduce((sum, tenantStats) => sum + tenantStats.monthlyRevenuePkr, 0)

  return (
    <>
      <section className="metric-grid" aria-label="Platform metrics">
        <Metric icon="building" label="Tenants" value={String(tenants.length)} trend={`${activeTenants} active tenants`} />
        <Metric icon="users" label="Total members" value={totalMembers.toLocaleString('en-PK')} trend="Central tenant_stats only" />
        <Metric icon="badge" label="Monthly revenue" value={formatPKR(monthlyRevenue)} trend="Aggregated only" />
        <Metric icon="shield" label="Suspended tenants" value={String(suspendedTenants)} trend="Billing follow-up required" />
      </section>

      <section className="notification-grid lower">
        <div className="panel table-panel">
          <PanelHeader title="Tenant management" action="Onboard gym" icon="plus" onAction={onProvisionTenant} />
          <TenantControlTable tenants={tenants} onManageTenant={onManageTenant} />
        </div>

        <div className="panel">
          <PanelHeader title="Platform guardrails" action="Audit" icon="shield" />
          <div className="rule-stack">
            <span>Super Admin reads central database only.</span>
            <span>Tenant member data stays isolated per gym database.</span>
            <span>Dashboard totals come from nightly tenant_stats sync.</span>
            <span>Provisioning creates tenant DB, domain, first branch, and admin account.</span>
          </div>
        </div>
      </section>
    </>
  )
}

function SuperAdminTenants({
  tenants,
  onProvisionTenant,
  onManageTenant,
}: {
  tenants: TenantSummary[]
  onProvisionTenant: () => void
  onManageTenant: (tenant: TenantSummary) => void
}) {
  const activeTenants = tenants.filter((tenant) => tenant.status === 'Active').length
  const trialTenants = tenants.filter((tenant) => tenant.status === 'Trial').length
  const suspendedTenants = tenants.filter((tenant) => tenant.status === 'Suspended' || tenant.status === 'Cancelled').length
  return (
    <>
      <section className="metric-grid" aria-label="Tenant controls">
        <Metric icon="building" label="Active tenants" value={String(activeTenants)} trend={`${trialTenants} trial, ${suspendedTenants} suspended/cancelled`} />
        <Metric icon="spark" label="Provisioning queue" value="0" trend="No pending tenant jobs" />
        <Metric icon="wallet" label="Billing due" value="PKR 0" trend="No invoices generated yet" />
        <Metric icon="shield" label="Isolation checks" value="Ready" trend="Central views exclude tenant member records" />
      </section>

      <section className="notification-grid lower">
        <div className="panel table-panel">
          <PanelHeader title="Tenant controls" action="Add tenant" icon="plus" onAction={onProvisionTenant} />
          <TenantControlTable tenants={tenants} onManageTenant={onManageTenant} />
        </div>

        <div className="panel">
          <PanelHeader title="Admin actions" action="Audit" icon="shield" />
          <div className="rule-stack">
            <span>Activate, suspend, or place tenant in trial mode.</span>
            <span>Assign subscription plan and billing cycle.</span>
            <span>Review tenant_stats without opening member records.</span>
            <span>Reset tenant admin MFA and session policies.</span>
          </div>
        </div>
      </section>
    </>
  )
}

function TenantControlTable({
  tenants,
  onManageTenant,
}: {
  tenants: TenantSummary[]
  onManageTenant: (tenant: TenantSummary) => void
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Tenant</th><th>Slug</th><th>Plan</th><th>Status</th><th>Members</th><th>Revenue</th><th></th></tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.slug}>
              <td><strong>{tenant.name}</strong></td>
              <td>{tenant.slug}</td>
              <td>{tenant.plan}</td>
              <td><span className={`log-status ${tenant.status === 'Active' ? 'delivered' : 'sent'}`}>{tenant.status}</span></td>
              <td>{tenant.members.toLocaleString('en-PK')}</td>
              <td>{formatPKR(tenant.revenue)}</td>
              <td>
                <button className="ghost-button table-action" type="button" onClick={() => onManageTenant(tenant)}>
                  Manage
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SuperAdminPlans({
  session,
  tenants,
  onTenantsChange,
}: {
  session: AuthSession
  tenants: TenantSummary[]
  onTenantsChange: (tenants: TenantSummary[]) => void
}) {
  const [plans, setPlans] = useState<PlatformPlan[]>([])
  const [billingSummary, setBillingSummary] = useState<PlatformBillingSummary | null>(null)
  const [billingInvoices, setBillingInvoices] = useState<PlatformBillingInvoice[]>([])
  const [busyPlanCode, setBusyPlanCode] = useState('')
  const [busyInvoiceId, setBusyInvoiceId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let isMounted = true
    Promise.all([
      gymFlowApi.platform.getPlans(session),
      gymFlowApi.platform.getBilling(session),
    ])
      .then(([planRows, billing]) => {
        if (!isMounted) return
        setPlans(planRows)
        setBillingSummary(billing.summary)
        setBillingInvoices(billing.invoices)
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load plans and billing.')
      })
    return () => {
      isMounted = false
    }
  }, [session])

  async function refreshBilling() {
    const billing = await gymFlowApi.platform.getBilling(session)
    setBillingSummary(billing.summary)
    setBillingInvoices(billing.invoices)
  }

  async function assignFirstTenant(plan: PlatformPlan) {
    const tenant = tenants[0]
    if (!tenant) return
    setBusyPlanCode(plan.code)
    setError('')
    setSuccess('')
    try {
      const updatedTenant = await gymFlowApi.platform.updateTenantPlan(session, tenant, plan.code)
      onTenantsChange(tenants.map((currentTenant) => currentTenant.id === updatedTenant.id ? updatedTenant : currentTenant))
      setSuccess(`${tenant.name} assigned to ${plan.name}.`)
      await refreshBilling()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to assign plan.')
    } finally {
      setBusyPlanCode('')
    }
  }

  async function increasePlanPrice(plan: PlatformPlan) {
    setBusyPlanCode(plan.code)
    setError('')
    setSuccess('')
    try {
      const result = await gymFlowApi.platform.upsertPlan(session, {
        code: plan.code,
        name: plan.name,
        monthlyPricePkr: plan.monthlyPricePkr + 1000,
        maxBranches: plan.maxBranches,
        maxMembers: plan.maxMembers,
        whatsappEnabled: plan.whatsappEnabled,
        smsEnabled: plan.smsEnabled,
        advancedReportsEnabled: plan.advancedReportsEnabled,
        isActive: plan.isActive,
      })
      setPlans((current) => current.map((currentPlan) => currentPlan.code === result.plan.code ? result.plan : currentPlan))
      setSuccess(`${plan.name} pricing updated to ${formatPKR(result.plan.monthlyPricePkr)}/mo.`)
      await refreshBilling()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update plan.')
    } finally {
      setBusyPlanCode('')
    }
  }

  async function generateInvoice() {
    const tenant = tenants[0]
    if (!tenant) return
    setBusyInvoiceId('__new__')
    setError('')
    setSuccess('')
    try {
      const result = await gymFlowApi.platform.createBillingInvoice(session, tenant)
      await refreshBilling()
      setSuccess(`${result.invoice.invoiceNumber} generated for ${tenant.name}.`)
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : 'Unable to generate invoice.')
    } finally {
      setBusyInvoiceId('')
    }
  }

  async function markInvoicePaid(invoice: PlatformBillingInvoice) {
    setBusyInvoiceId(invoice.id)
    setError('')
    setSuccess('')
    try {
      const result = await gymFlowApi.platform.markBillingInvoicePaid(session, invoice)
      await refreshBilling()
      setSuccess(`${result.invoice.invoiceNumber} marked paid.`)
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : 'Unable to mark invoice paid.')
    } finally {
      setBusyInvoiceId('')
    }
  }

  return (
    <>
      <section className="metric-grid" aria-label="Plan metrics">
        <Metric icon="badge" label="Published plans" value={String(plans.length)} trend={plans.map((plan) => plan.name).join(', ') || 'Loading'} />
        <Metric icon="wallet" label="MRR tracked" value={formatPKR(billingSummary?.mrrPkr ?? plans.reduce((sum, plan) => sum + plan.monthlyPricePkr, 0))} trend="Central billing database" />
        <Metric icon="receipt" label="Open invoices" value={String(billingSummary?.openInvoiceCount ?? 0)} trend={formatPKR(billingSummary?.issuedPkr ?? 0)} />
        <Metric icon="shield" label="Paid billing" value={formatPKR(billingSummary?.paidPkr ?? 0)} trend={`${formatPKR(billingSummary?.overduePkr ?? 0)} overdue`} />
      </section>

      {error && (
        <div className="error-banner">
          <AppIcon name="x" size={17} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="success-banner">
          <AppIcon name="check" size={17} />
          <span>{success}</span>
        </div>
      )}

      <section className="plan-grid">
        {plans.map((plan) => (
          <div className="panel plan-card" key={plan.name}>
            <PanelHeader title={plan.name} action="Increase price" icon="settings" onAction={() => increasePlanPrice(plan)} />
            <strong>{formatPKR(plan.monthlyPricePkr)}/mo</strong>
            <span>{plan.maxBranches ?? 'Unlimited'} branches · {plan.maxMembers ?? 'Unlimited'} members</span>
            <p>{plan.advancedReportsEnabled ? 'Advanced reports enabled' : 'Core reports'} · WhatsApp {plan.whatsappEnabled ? 'on' : 'off'} · SMS {plan.smsEnabled ? 'on' : 'off'}</p>
            <button className="ghost-button full" type="button" onClick={() => assignFirstTenant(plan)} disabled={busyPlanCode === plan.code}>
              {busyPlanCode === plan.code ? 'Assigning' : `Assign to ${tenants[0]?.name ?? 'tenant'}`}
            </button>
          </div>
        ))}
      </section>

      <section className="panel table-panel billing-panel">
        <PanelHeader title="Subscription billing" action={busyInvoiceId === '__new__' ? 'Generating' : 'Generate invoice'} icon="receipt" onAction={generateInvoice} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Invoice</th><th>Tenant</th><th>Plan</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {billingInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td><strong>{invoice.invoiceNumber}</strong><span className="subtle-cell">{invoice.periodStart} to {invoice.periodEnd}</span></td>
                  <td>{invoice.tenantName}</td>
                  <td>{invoice.planName}</td>
                  <td>{formatPKR(invoice.amountPkr)}</td>
                  <td>{formatDateLabel(invoice.dueDate)}</td>
                  <td><span className={`log-status ${invoice.status === 'paid' ? 'delivered' : invoice.status === 'overdue' ? 'failed' : 'sent'}`}>{invoice.status}</span></td>
                  <td>
                    <button className="ghost-button table-action" type="button" onClick={() => markInvoicePaid(invoice)} disabled={invoice.status === 'paid' || busyInvoiceId === invoice.id}>
                      {busyInvoiceId === invoice.id ? 'Saving' : invoice.status === 'paid' ? 'Paid' : 'Mark paid'}
                    </button>
                  </td>
                </tr>
              ))}
              {billingInvoices.length === 0 && (
                <tr>
                  <td colSpan={7}>No invoices generated yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function SuperAdminProvisioning({ onProvisionTenant }: { onProvisionTenant: () => void }) {
  const provisioningSteps = [
    { title: 'Create central tenant', detail: 'Stores tenant profile, slug, plan, and provisioning status.' },
    { title: 'Prepare tenant database', detail: 'Creates an isolated tenant data store before first login.' },
    { title: 'Configure access', detail: 'Adds initial tenant admin credentials and branch defaults.' },
    { title: 'Verify routing', detail: 'Checks login URL, API health, and tenant isolation guards.' },
  ]
  return (
    <section className="two-column">
      <div className="panel">
          <PanelHeader title="Onboard gym" action="Create" icon="plus" onAction={onProvisionTenant} />
          <div className="settings-list">
          <label>Gym name<HintInput placeholder="Gym name" detail="Entered by Super Admin while creating a tenant." /></label>
          <label>Subdomain<HintInput placeholder="Subdomain" detail="Generated from the tenant slug during provisioning." /></label>
          <label>Plan<HintInput placeholder="Subscription plan" detail="Selected during tenant onboarding." /></label>
          <label>Owner email<HintInput placeholder="Owner email" detail="Added by Super Admin during onboarding." /></label>
          <label>Timezone<HintInput placeholder="Timezone" detail="Default timezone is Asia/Karachi." /></label>
        </div>
      </div>

      <div className="panel">
        <PanelHeader title="Provisioning checklist" action="Run checks" icon="spark" />
        <div className="provisioning-list">
          {provisioningSteps.map((step, index) => (
            <div className="provisioning-step" key={step.title}>
              <b>{index + 1}</b>
              <div>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SuperAdminSettings({ session }: { session: AuthSession }) {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditError, setAuditError] = useState('')
  const [serviceStatus, setServiceStatus] = useState('')

  useEffect(() => {
    let isMounted = true
    gymFlowApi.platform.getAuditLogs(session)
      .then((logs) => {
        if (isMounted) setAuditLogs(logs)
      })
      .catch((loadError) => {
        if (isMounted) setAuditError(loadError instanceof Error ? loadError.message : 'Unable to load platform audit.')
      })
    return () => {
      isMounted = false
    }
  }, [session])

  async function refreshAuditLogs() {
    setAuditError('')
    try {
      setAuditLogs(await gymFlowApi.platform.getAuditLogs(session))
    } catch (loadError) {
      setAuditError(loadError instanceof Error ? loadError.message : 'Unable to load platform audit.')
    }
  }

  return (
    <section className="two-column">
      <div className="panel">
        <PanelHeader title="Platform access" action="Save" icon="shield" />
        <div className="settings-list">
          <label>Super Admin URL<HintInput placeholder="Super Admin URL" detail="app.gymflow.pk" /></label>
          <label>Tenant URL pattern<HintInput placeholder="Tenant URL pattern" detail="{tenant}.gymflow.pk" /></label>
          <label>MFA policy<HintInput placeholder="MFA policy" detail="Required for all platform admins." /></label>
          <label>Session timeout<HintInput placeholder="Session timeout" detail="4 hours." /></label>
        </div>
      </div>
      <div className="panel">
        <PanelHeader title="Central services" action="Test" icon="settings" onAction={() => setServiceStatus('Central services reachable. Billing, provisioning, stats sync, and audit retention are ready for demo.')} />
        <div className="settings-list">
          <label>Billing<HintInput placeholder="Billing status" detail="Enabled." /></label>
          <label>Tenant stats sync<HintInput placeholder="Stats sync schedule" detail="Nightly at 2:00 AM PKT." /></label>
          <label>Provisioning queue<HintInput placeholder="Provisioning queue" detail="Enabled." /></label>
          <label>Audit retention<HintInput placeholder="Audit retention" detail="7 years." /></label>
        </div>
        {serviceStatus && (
          <div className="success-banner compact">
            <AppIcon name="check" size={17} />
            <span>{serviceStatus}</span>
          </div>
        )}
      </div>
      <div className="panel audit-panel">
        <PanelHeader title="Platform audit" action="Refresh" icon="shield" onAction={refreshAuditLogs} />
        {auditError && (
          <div className="error-banner compact">
            <AppIcon name="x" size={17} />
            <span>{auditError}</span>
          </div>
        )}
        <AuditLogList logs={auditLogs} emptyText="No platform audit entries yet." />
      </div>
    </section>
  )
}

function ReportsView({ role, session }: { role: LoginRole; session: AuthSession }) {
  const [summary, setSummary] = useState<TenantReportSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    gymFlowApi.tenant.getReportSummary(session)
      .then((reportSummary) => {
        if (isMounted) setSummary(reportSummary)
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load reports.')
      })
    return () => {
      isMounted = false
    }
  }, [session])

  const reports = role === 'staff'
    ? [
        ['Today collections', formatPKR(summary?.collectionsPkr ?? 0), 'Current shift and payment method breakdown'],
        ['Dues follow-up', String(summary?.outstandingDuesPkr ?? 0), 'Outstanding dues in tenant scope'],
        ['Upcoming renewals', String(summary?.renewalDueCount ?? 0), 'Next 30 days, branch scoped'],
        ['My collections', formatPKR(summary?.collectionsPkr ?? 0), 'Payments recorded through this tenant portal'],
      ]
    : [
        ['Revenue by date', formatPKR(summary?.collectionsPkr ?? 0), 'Payment method breakdown'],
        ['Dues list', formatPKR(summary?.outstandingDuesPkr ?? 0), `${summary?.activeMembers ?? 0} active members`],
        ['Staff collections', formatPKR(summary?.collectionsPkr ?? 0), 'Collector split will populate after staff payments'],
        ['Upcoming renewals', String(summary?.renewalDueCount ?? 0), 'Next 30 days'],
        ['Suspended / cancelled', String(summary?.suspendedMembers ?? 0), 'Date range enabled'],
      ]

  function exportReport(title: string, value: string, detail: string) {
    downloadCsv(`gymflow-${title.toLowerCase().replaceAll(' ', '-')}.csv`, [{
      report: title,
      value,
      detail,
      generatedAt: new Date().toLocaleString('en-PK'),
    }])
  }

  function exportPaymentMethod(method: TenantReportSummary['paymentMethodBreakdown'][number]) {
    downloadCsv(`gymflow-payment-${method.method}.csv`, [{
      method: method.method,
      amountPkr: method.amountPkr,
      generatedAt: new Date().toLocaleString('en-PK'),
    }])
  }

  return (
    <>
      {error && (
        <div className="error-banner">
          <AppIcon name="x" size={17} />
          <span>{error}</span>
        </div>
      )}
      <section className="report-grid">
        {reports.map(([title, value, detail]) => (
          <div className="panel report-tile" key={title}>
            <PanelHeader title={title} action="Export" icon="download" onAction={() => exportReport(title, value, detail)} />
            <strong>{value}</strong>
            <span>{detail}</span>
          </div>
        ))}
        {(summary?.paymentMethodBreakdown ?? []).map((method) => (
          <div className="panel report-tile" key={method.method}>
            <PanelHeader title={method.method.replace('_', ' ')} action="Export" icon="download" onAction={() => exportPaymentMethod(method)} />
            <strong>{formatPKR(method.amountPkr)}</strong>
            <span>Payment method breakdown</span>
          </div>
        ))}
      </section>
    </>
  )
}

function SettingsView({ session }: { session: AuthSession }) {
  const [settings, setSettings] = useState<TenantSettings | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [branchName, setBranchName] = useState('')
  const [planName, setPlanName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [auditError, setAuditError] = useState('')
  const [integrationStatus, setIntegrationStatus] = useState('')
  const canManageSettings = roleAccess[session.role].canManageSettings

  useEffect(() => {
    let isMounted = true
    gymFlowApi.tenant.getSettings(session)
      .then((tenantSettings) => {
        if (isMounted) setSettings(tenantSettings)
      })
      .catch((loadError) => {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load settings.')
      })
    return () => {
      isMounted = false
    }
  }, [session])

  useEffect(() => {
    let isMounted = true
    gymFlowApi.tenant.getAuditLogs(session)
      .then((logs) => {
        if (isMounted) setAuditLogs(logs)
      })
      .catch((loadError) => {
        if (isMounted) setAuditError(loadError instanceof Error ? loadError.message : 'Unable to load tenant audit.')
      })
    return () => {
      isMounted = false
    }
  }, [session])

  async function refreshAuditLogs() {
    setAuditError('')
    try {
      setAuditLogs(await gymFlowApi.tenant.getAuditLogs(session))
    } catch (loadError) {
      setAuditError(loadError instanceof Error ? loadError.message : 'Unable to load tenant audit.')
    }
  }

  async function addBranch() {
    if (!branchName.trim()) return
    setIsSaving(true)
    setError('')
    try {
      const result = await gymFlowApi.tenant.createBranch(session, { name: branchName.trim(), city: 'Karachi' })
      setSettings((current) => current ? { ...current, branches: [result.branch, ...current.branches] } : current)
      setBranchName('')
      await refreshAuditLogs()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to add branch.')
    } finally {
      setIsSaving(false)
    }
  }

  async function addPlan() {
    if (!planName.trim()) return
    setIsSaving(true)
    setError('')
    try {
      const result = await gymFlowApi.tenant.createMembershipPlan(session, {
        name: planName.trim(),
        billingCycle: 'monthly',
        pricePkr: 5000,
        graceDays: 3,
      })
      setSettings((current) => current ? { ...current, membershipPlans: [result.plan, ...current.membershipPlans] } : current)
      setPlanName('')
      await refreshAuditLogs()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to add membership plan.')
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleBranch(branch: TenantSettings['branches'][number]) {
    if (!canManageSettings) return
    setIsSaving(true)
    setError('')
    try {
      const result = await gymFlowApi.tenant.updateBranch(session, branch, { isActive: !branch.isActive })
      setSettings((current) => current
        ? { ...current, branches: current.branches.map((item) => item.id === branch.id ? result.branch : item) }
        : current)
      await refreshAuditLogs()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update branch.')
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleMembershipPlan(plan: TenantSettings['membershipPlans'][number]) {
    if (!canManageSettings) return
    setIsSaving(true)
    setError('')
    try {
      const result = await gymFlowApi.tenant.updateMembershipPlan(session, plan, { isActive: !plan.isActive })
      setSettings((current) => current
        ? { ...current, membershipPlans: current.membershipPlans.map((item) => item.id === plan.id ? result.plan : item) }
        : current)
      await refreshAuditLogs()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update membership plan.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="two-column">
      <div className="panel">
        <PanelHeader title="Gym profile" action="Save" icon="building" />
        <div className="settings-list">
          <label>Gym name<HintInput placeholder="Gym name" detail={session.workspace} /></label>
          <label>Timezone<HintInput placeholder="Timezone" detail="Asia/Karachi" /></label>
          <label>Currency<HintInput placeholder="Currency" detail="PKR" /></label>
          <label>Session timeout<HintInput placeholder="Session timeout" detail="8 hours" /></label>
        </div>
      </div>
      <div className="panel">
        <PanelHeader title="Staff access" action="Review" icon="shield" />
        <div className="profile-list">
          {(settings?.staffAccess ?? []).map((accessItem) => (
            <div className="profile-list-row" key={accessItem.role}>
              <AppIcon name="shield" size={18} />
              <div>
                <strong>{accessItem.label}</strong>
                <span>{accessItem.canManageSettings ? 'Settings enabled' : 'Settings restricted'} · Payments {accessItem.canRecordPayments ? 'enabled' : 'restricted'}</span>
              </div>
              <b>{accessItem.canManageMembers ? 'Members' : 'View only'}</b>
            </div>
          ))}
        </div>
      </div>
      {error && (
        <div className="error-banner">
          <AppIcon name="x" size={17} />
          <span>{error}</span>
        </div>
      )}
      <div className="panel">
        <PanelHeader title="Branches" action="Add" icon="plus" onAction={canManageSettings ? addBranch : undefined} />
        <div className="settings-list">
          <label>New branch<input value={branchName} onChange={(event) => setBranchName(event.target.value)} readOnly={!canManageSettings} placeholder="Branch name" title="Enter a new branch name, then press Add." /></label>
        </div>
        <div className="profile-list">
          {(settings?.branches ?? []).map((branch) => (
            <div className="profile-list-row" key={branch.id}>
              <AppIcon name="building" size={18} />
              <div>
                <strong>{branch.name}</strong>
                <span>{branch.city} · {branch.address ?? 'No address set'}</span>
              </div>
              <span className="settings-row-actions">
                <b>{branch.isActive ? 'Active' : 'Inactive'}</b>
                <button className="ghost-button table-action" type="button" onClick={() => toggleBranch(branch)} disabled={!canManageSettings || isSaving}>
                  {branch.isActive ? 'Disable' : 'Enable'}
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <PanelHeader title="Membership plans" action={isSaving ? 'Saving' : 'Add'} icon="badge" onAction={canManageSettings ? addPlan : undefined} />
        <div className="settings-list">
          <label>New plan<input value={planName} onChange={(event) => setPlanName(event.target.value)} readOnly={!canManageSettings} placeholder="Plan name" title="Enter a membership plan name, then press Add." /></label>
        </div>
        <div className="profile-list">
          {(settings?.membershipPlans ?? []).map((plan) => (
            <div className="profile-list-row" key={plan.id}>
              <AppIcon name="badge" size={18} />
              <div>
                <strong>{plan.name}</strong>
                <span>{plan.billingCycle} · {plan.graceDays} grace days · {plan.isActive ? 'active' : 'inactive'}</span>
              </div>
              <span className="settings-row-actions">
                <b>{formatPKR(plan.pricePkr)}</b>
                <button className="ghost-button table-action" type="button" onClick={() => toggleMembershipPlan(plan)} disabled={!canManageSettings || isSaving}>
                  {plan.isActive ? 'Disable' : 'Enable'}
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <PanelHeader title="Integrations" action="Test" icon="settings" onAction={() => setIntegrationStatus('Provider stubs are reachable. Live WhatsApp, SMS, and email keys are not configured yet.')} />
        <div className="settings-list">
          <label>WhatsApp BSP<HintInput placeholder="WhatsApp provider" detail="Not configured." /></label>
          <label>SMS sender<HintInput placeholder="SMS sender" detail="Not configured." /></label>
          <label>Email<HintInput placeholder="Email status" detail="Phase 2 - inactive." /></label>
          <label>Data retention<HintInput placeholder="Data retention" detail="3 years, then anonymise PII." /></label>
        </div>
        {integrationStatus && (
          <div className="success-banner compact">
            <AppIcon name="check" size={17} />
            <span>{integrationStatus}</span>
          </div>
        )}
      </div>
      <div className="panel audit-panel">
        <PanelHeader title="Tenant audit" action="Refresh" icon="shield" onAction={refreshAuditLogs} />
        {auditError && (
          <div className="error-banner compact">
            <AppIcon name="x" size={17} />
            <span>{auditError}</span>
          </div>
        )}
        <AuditLogList logs={auditLogs} emptyText="No tenant audit entries yet." />
      </div>
    </section>
  )
}

function AuditLogList({ logs, emptyText }: { logs: AuditLog[]; emptyText: string }) {
  if (logs.length === 0) {
    return (
      <div className="rule-box audit-empty">
        <AppIcon name="spark" size={18} />
        <span>{emptyText}</span>
      </div>
    )
  }

  return (
    <div className="profile-list audit-list">
      {logs.slice(0, 8).map((log) => (
        <div className="profile-list-row audit-row" key={log.id}>
          <AppIcon name={log.scope === 'platform' ? 'shield' : 'list'} size={18} />
          <div>
            <strong>{formatActionLabel(log.action)}</strong>
            <span>{log.actorName} · {log.entityType}{log.entityId ? ` · ${log.entityId}` : ''}</span>
          </div>
          <b>{formatDateTimeLabel(log.createdAt)}</b>
        </div>
      ))}
    </div>
  )
}

function Metric({ icon, label, value, trend }: { icon: IconName; label: string; value: string; trend: string }) {
  return (
    <div className="metric">
      <div className="metric-icon"><AppIcon name={icon} size={19} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{trend}</small>
    </div>
  )
}

function PanelHeader({
  title,
  action,
  icon,
  onAction,
}: {
  title: string
  action: string
  icon: IconName
  onAction?: () => void
}) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <button className="panel-action" type="button" onClick={onAction}>
        <AppIcon name={icon} size={16} />
        {action}
      </button>
    </div>
  )
}

function AppIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  const simple = {
    badge: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M8 12h8" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0v4l-2 3h16l-2-3Z" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
    building: <><path d="M5 21V5l7-3 7 3v16" /><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h6" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    check: <path d="M5 13l4 4L19 7" />,
    credit: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    dashboard: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    download: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
    dumbbell: <><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></>,
    eye: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    filter: <><path d="M4 5h16l-6 7v5l-4 2v-7Z" /></>,
    gauge: <><path d="M4 14a8 8 0 0 1 16 0" /><path d="M12 14l4-4" /><path d="M6 18h12" /></>,
    list: <><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    message: <><path d="M4 5h16v12H7l-3 3Z" /><path d="M8 9h8M8 13h5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5 7 17M7 7 5.5 5.5M18.5 18.5 17 17" /></>,
    shield: <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6Z" />,
    spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" /><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8Z" /></>,
    'user-plus': <><circle cx="9" cy="8" r="4" /><path d="M3 21a6 6 0 0 1 12 0M18 8v6M15 11h6" /></>,
    users: <><circle cx="9" cy="8" r="4" /><path d="M3 21a6 6 0 0 1 12 0" /><path d="M17 11a4 4 0 0 1 4 4v3" /></>,
    wallet: <><path d="M4 7h16v12H4Z" /><path d="M16 12h4v4h-4z" /><path d="M4 7l3-3h10l3 3" /></>,
    x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  } satisfies Record<IconName, ReactNode>

  return <svg {...common}>{simple[name]}</svg>
}

function StatusBadge({ status }: { status: MemberStatus }) {
  return <span className={`status ${status.toLowerCase().replace(' ', '-')}`}>{status}</span>
}

export default App
