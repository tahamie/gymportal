import type { IncomingMessage, ServerResponse } from 'node:http'
import { getBearerToken, readToken, sendError } from './http.js'
import { platformRepository } from './repositories/index.js'
import type { Role, TenantRecord, UserSession } from './types.js'

export type AuthContext = {
  user: UserSession
}

export type TenantContext = AuthContext & {
  tenant: TenantRecord
}

export function requireAuth(req: IncomingMessage, res: ServerResponse, allowedRoles: Role[]): AuthContext | null {
  const token = getBearerToken(req)
  if (!token) {
    sendError(res, 401, 'AUTH_REQUIRED', 'Bearer token is required.')
    return null
  }

  const user = readToken<UserSession>(token)
  if (!user) {
    sendError(res, 401, 'INVALID_TOKEN', 'Bearer token is invalid.')
    return null
  }

  if (!allowedRoles.includes(user.role)) {
    sendError(res, 403, 'FORBIDDEN', 'This role cannot access this endpoint.')
    return null
  }

  return { user }
}

export async function requireTenantContext(req: IncomingMessage, res: ServerResponse): Promise<TenantContext | null> {
  const auth = requireAuth(req, res, ['tenant-admin', 'staff'])
  if (!auth) return null

  const tenantId = req.headers['x-tenant-id']
  if (typeof tenantId !== 'string') {
    sendError(res, 400, 'TENANT_HEADER_REQUIRED', 'X-Tenant-ID header is required.')
    return null
  }

  if (auth.user.tenantId !== tenantId) {
    sendError(res, 403, 'TENANT_MISMATCH', 'User session does not belong to this tenant.')
    return null
  }

  const tenant = await platformRepository.findTenantById(tenantId)
  if (!tenant) {
    sendError(res, 404, 'TENANT_NOT_FOUND', 'Tenant was not found.')
    return null
  }

  return { ...auth, tenant }
}

export function requirePlatformContext(req: IncomingMessage, res: ServerResponse): AuthContext | null {
  return requireAuth(req, res, ['super-admin'])
}
