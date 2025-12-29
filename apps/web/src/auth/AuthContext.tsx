import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { auth, googleProvider } from './firebase'

type AuthContextValue = {
  user: User | null
  isLoading: boolean

  signupWithEmailPassword: (email: string, password: string) => Promise<void>
  loginWithEmailPassword: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setIsLoading(false)
    })
    return () => unsub()
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      isLoading,

      async signupWithEmailPassword(email: string, password: string) {
        await createUserWithEmailAndPassword(auth, email, password)
      },

      async loginWithEmailPassword(email: string, password: string) {
        await signInWithEmailAndPassword(auth, email, password)
      },

      async loginWithGoogle() {
        await signInWithPopup(auth, googleProvider)
      },

      async signOut() {
        await firebaseSignOut(auth)
      },
    }
  }, [user, isLoading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
