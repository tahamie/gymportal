import { getRepositoryMode } from './contracts.js'
import { createFileRepositories } from './fileRepositories.js'
import { createPostgresRepositories } from './postgresRepositories.js'

export const repositoryMode = getRepositoryMode()

const repositories =
  repositoryMode === 'postgres'
    ? createPostgresRepositories()
    : createFileRepositories()

export const authRepository = repositories.auth
export const platformRepository = repositories.platform
export const membersRepository = repositories.members
export const paymentsRepository = repositories.payments
export const notificationsRepository = repositories.notifications
export const renewalsRepository = repositories.renewals
export const settingsRepository = repositories.settings
export const reportsRepository = repositories.reports
export const auditRepository = repositories.audit
export const billingRepository = repositories.billing
