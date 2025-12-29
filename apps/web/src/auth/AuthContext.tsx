import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { auth, googleProvider, isFirebaseConfigured } from './firebase'

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
  const [user, setUser] = useState<User | null>(() => {
    if (!isFirebaseConfigured || !auth) return null
    return auth.currentUser
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setUser(null)
      setIsLoading(false)
      return
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setIsLoading(false)
    })
    return () => unsub()
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const requireFirebase = () => {
      if (!isFirebaseConfigured || !auth) {
        throw new Error(
          'Firebase is not configured. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID and rebuild the web app.',
        )
      }
    }

    return {
      user,
      isLoading,

      async signupWithEmailPassword(email: string, password: string) {
        requireFirebase()
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        setUser(cred.user)
      },

      async loginWithEmailPassword(email: string, password: string) {
        requireFirebase()
        const cred = await signInWithEmailAndPassword(auth, email, password)
        setUser(cred.user)
      },

      async loginWithGoogle() {
        requireFirebase()
        if (!googleProvider) {
          throw new Error('Google sign-in is not available because Firebase is not configured.')
        }
        const cred = await signInWithPopup(auth, googleProvider)
        setUser(cred.user)
      },

      async signOut() {
        requireFirebase()
        await firebaseSignOut(auth)
        setUser(null)
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
