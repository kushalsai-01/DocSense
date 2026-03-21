import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, clearTokens, setTokens } from '../lib/api'
import type { AuthResponse, AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  loginWithGoogle: (idToken: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On mount, try to load current user if we have a token
  useEffect(() => {
    const token = localStorage.getItem('ds_access_token')
    if (!token) {
      setIsLoading(false)
      return
    }
    api
      .get<{ user: AuthUser }>('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => {
        clearTokens()
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password })
    setTokens(data.token, data.refreshToken)
    setUser(data.user)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/register', { name, email, password })
    setTokens(data.token, data.refreshToken)
    setUser(data.user)
  }, [])

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const { data } = await api.post<AuthResponse>('/auth/google', { idToken })
    setTokens(data.token, data.refreshToken)
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      clearTokens()
      setUser(null)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, register, loginWithGoogle, logout }),
    [user, isLoading, login, register, loginWithGoogle, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
