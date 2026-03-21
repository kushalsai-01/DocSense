import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Token management ──────────────────────────────────────────────────

export function getAccessToken(): string | null {
  return localStorage.getItem('ds_access_token')
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('ds_access_token', accessToken)
  localStorage.setItem('ds_refresh_token', refreshToken)
}

export function clearTokens(): void {
  localStorage.removeItem('ds_access_token')
  localStorage.removeItem('ds_refresh_token')
}

// ── Attach JWT on every request ───────────────────────────────────────

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Auto-refresh on 401 ───────────────────────────────────────────────

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error)
    } else {
      p.resolve(token!)
    }
  })
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshToken = localStorage.getItem('ds_refresh_token')
        if (!refreshToken) throw new Error('No refresh token')

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
        setTokens(data.token, refreshToken)
        processQueue(null, data.token)

        originalRequest.headers.Authorization = `Bearer ${data.token}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        clearTokens()
        window.location.href = '/auth'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)
