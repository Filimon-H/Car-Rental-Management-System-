export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const BASE_URL = `${API_BASE_URL}/public`

/** Telegram bot handle, overridable per deployment. */
export const TELEGRAM_BOT_USERNAME =
  import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'Novacar67_bot'
export const TELEGRAM_BOT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`

/**
 * Where the staff app lives.
 *
 * This was hardcoded to http://localhost:3000/login, which is dead for every
 * visitor once deployed and advertises the admin app's location publicly.
 */
export const STAFF_LOGIN_URL =
  import.meta.env.VITE_STAFF_LOGIN_URL || 'http://localhost:3000/login'

export const uploadsUrl = (path: string | null) =>
  path ? `${API_BASE_URL}/uploads/${path}` : null

function getToken(): string | null {
  return localStorage.getItem('customer_token')
}

export function clearAuthAndRedirect() {
  localStorage.removeItem('customer_token')
  // dispatch so auth store can react without a hard reload
  window.dispatchEvent(new Event('auth:expired'))
}

/** Decode JWT payload without a library. Returns null if malformed. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** True if the token is missing, malformed, or past its exp claim. */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.exp !== 'number') return true
  return payload.exp * 1000 < Date.now()
}

/** One entry of FastAPI's 422 `detail` array. */
interface ValidationErrorItem {
  loc: (string | number)[]
  msg: string
  type: string
}

function isValidationDetail(detail: unknown): detail is ValidationErrorItem[] {
  return (
    Array.isArray(detail) &&
    detail.every((item) => !!item && typeof item === 'object' && 'msg' in item)
  )
}

/**
 * Turn an error body into something readable.
 *
 * FastAPI sends a string `detail` for handled errors but an array of
 * per-field objects for a 422. Rendering that directly produced
 * "[object Object]", so every validation message on signup and booking was
 * unreadable.
 */
export function describeApiError(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail

  if (typeof detail === 'string' && detail) return detail

  if (isValidationDetail(detail)) {
    const messages = detail.map((item) => {
      const field = item.loc.filter((part) => part !== 'body' && part !== 'query').join('.')
      return field ? `${field}: ${item.msg}` : item.msg
    })
    if (messages.length) return messages.join('; ')
  }

  return `HTTP ${status}`
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    clearAuthAndRedirect()
    throw new Error('Session expired. Please sign in again.')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(describeApiError(body, res.status))
  }
  return res.json() as Promise<T>
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
}
