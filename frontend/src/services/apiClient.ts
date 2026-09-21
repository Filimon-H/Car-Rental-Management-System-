import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export interface ApiError {
  error_code: string
  /**
   * FastAPI sends a string for handled errors (HTTPException) but an array of
   * per-field objects for request-validation failures (422). Callers must not
   * render this directly — use `getErrorMessage` / `getFieldErrors`.
   */
  detail: string | ValidationErrorItem[]
}

/** One entry of FastAPI's 422 `detail` array. */
export interface ValidationErrorItem {
  /** Path to the offending value, e.g. ['body', 'email']. */
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
 * Map a 422 response onto its field names, so a form can highlight the inputs
 * that failed. The leading 'body'/'query' segment of `loc` is dropped, leaving
 * the field name as the form knows it. Returns {} for non-validation errors.
 */
export function getFieldErrors(error: unknown): Record<string, string> {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (!isValidationDetail(detail)) return {}

  const fields: Record<string, string> = {}
  for (const item of detail) {
    const path = item.loc.filter((part) => part !== 'body' && part !== 'query')
    const key = path.join('.') || '_'
    // Keep the first message per field; later ones are usually less specific.
    if (!(key in fields)) fields[key] = item.msg
  }
  return fields
}

/**
 * Human-readable message for any API error. Handles FastAPI's two `detail`
 * shapes — a plain string, and the 422 array that would otherwise render as
 * "[object Object]".
 */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const response = (error as { response?: { data?: { detail?: unknown } } })?.response
  const detail = response?.data?.detail

  if (typeof detail === 'string' && detail) return detail

  if (isValidationDetail(detail)) {
    const messages = Object.entries(getFieldErrors(error)).map(([field, msg]) =>
      field === '_' ? msg : `${field}: ${msg}`
    )
    if (messages.length) return messages.join('; ')
  }

  const message = (error as { message?: string })?.message
  return message || fallback
}

class ApiClient {
  private client: AxiosInstance
  private accessToken: string | null = null

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.client.interceptors.request.use(this.requestInterceptor.bind(this))
    this.client.interceptors.response.use(
      (response) => response,
      this.responseErrorInterceptor.bind(this)
    )

    // Load token from storage on init
    this.accessToken = localStorage.getItem('access_token')
  }

  private requestInterceptor(config: InternalAxiosRequestConfig) {
    // Always read token from localStorage to handle login after module load
    const token = this.accessToken || localStorage.getItem('access_token')
    if (token) {
      // Set Authorization header - works with all Axios versions
      config.headers = config.headers || {}
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  }

  private async responseErrorInterceptor(error: AxiosError<ApiError>) {
    const originalRequest = error.config as (typeof error.config & { _retried?: boolean }) | undefined

    // Handle 401 - try to refresh token once, then redirect to login
    if (error.response?.status === 401 && originalRequest && !originalRequest._retried) {
      originalRequest._retried = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const response = await this.client.post('/auth/refresh', {
            refresh_token: refreshToken,
          })
          const { access_token } = response.data
          this.setTokens(access_token, refreshToken)
          originalRequest.headers = originalRequest.headers || {}
          originalRequest.headers['Authorization'] = `Bearer ${access_token}`
          return this.client(originalRequest)
        } catch {
          // Refresh failed — clear tokens and force re-login
          this.clearTokens()
          window.location.href = '/login'
        }
      } else {
        // No refresh token at all — send to login
        this.clearTokens()
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refreshToken)
  }

  clearTokens() {
    this.accessToken = null
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  isAuthenticated(): boolean {
    return !!this.accessToken
  }

  // HTTP methods
  async get<T>(url: string, params?: Record<string, unknown>) {
    const response = await this.client.get<T>(url, { params })
    return response.data
  }

  async getBlob(url: string, params?: Record<string, unknown>) {
    const response = await this.client.get<Blob>(url, {
      params,
      responseType: 'blob',
    })
    return response.data
  }

  async post<T>(url: string, data?: unknown) {
    const response = await this.client.post<T>(url, data)
    return response.data
  }

  async put<T>(url: string, data?: unknown) {
    const response = await this.client.put<T>(url, data)
    return response.data
  }

  async delete<T>(url: string) {
    const response = await this.client.delete<T>(url)
    return response.data
  }

  async patch<T>(url: string, data?: unknown) {
    const response = await this.client.patch<T>(url, data)
    return response.data
  }

  async uploadFile<T>(url: string, file: File, fieldName = 'file') {
    const formData = new FormData()
    formData.append(fieldName, file)
    const response = await this.client.post<T>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async postFormData<T>(url: string, formData: FormData) {
    const response = await this.client.post<T>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }
}

export const apiClient = new ApiClient()
export default apiClient
