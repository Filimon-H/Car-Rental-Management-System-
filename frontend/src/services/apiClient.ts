import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export interface ApiError {
  error_code: string
  detail: string
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
    const originalRequest = error.config

    // Handle 401 - try to refresh token
    if (error.response?.status === 401 && originalRequest) {
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
          // Refresh failed, clear tokens
          this.clearTokens()
        }
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
