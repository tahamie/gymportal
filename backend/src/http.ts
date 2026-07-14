import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ApiResponse } from './types.js'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type RequestContext = {
  req: IncomingMessage
  res: ServerResponse
  method: HttpMethod
  url: URL
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  const chunks: Uint8Array[] = []

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  if (!chunks.length) return null

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    return null
  }
}

export function sendJson<T>(res: ServerResponse, statusCode: number, body: ApiResponse<T>) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Tenant-ID',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  })
  res.end(JSON.stringify(body))
}

export function sendOk<T>(res: ServerResponse, data: T, statusCode = 200) {
  sendJson(res, statusCode, { ok: true, data })
}

export function sendError(res: ServerResponse, statusCode: number, code: string, message: string) {
  sendJson(res, statusCode, { ok: false, error: { code, message } })
}

export function getBearerToken(req: IncomingMessage) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  return authHeader.slice('Bearer '.length)
}

export function createToken(payload: object) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function readToken<T>(token: string): T | null {
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
