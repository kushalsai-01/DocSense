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

// Demo credentials for dev mode without Firebase
const DEMO_EMAIL = 'demo@docsense.app'
const DEMO_PASSWORD = 'demo123'

// Create a mock user for demo mode
const createDemoUser = (): User => ({
  uid: 'demo-user-123',
  email: DEMO_EMAIL,
  displayName: 'Demo User',
  photoURL: null,
  emailVerified: true,
  isAnonymous: false,
  metadata: {} as any,
  providerData: [],
  refreshToken: '',
  tenantId: null,
  delete: async () => {},
  getIdToken: async () => 'demo-token',
  getIdTokenResult: async () => ({} as any),
  reload: async () => {},
  toJSON: () => ({}),
  phoneNumber: null,
  providerId: 'demo',
} as User)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (!isFirebaseConfigured || !auth) {
      // Check localStorage for demo session
      const demoSession = localStorage.getItem('demo-session')
      return demoSession ? createDemoUser() : null
    }
    return auth.currentUser
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      // In dev mode, check for existing demo session
      const demoSession = localStorage.getItem('demo-session')
      setUser(demoSession ? createDemoUser() : null)
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
          'Firebase is not configured. Use demo credentials: demo@docsense.app / demo123',
        )
      }
    }

    return {
      user,
      isLoading,

      async signupWithEmailPassword(email: string, password: string) {
        // Demo mode: accept demo credentials
        if (!isFirebaseConfigured || !auth) {
          if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
            localStorage.setItem('demo-session', 'true')
            const demoUser = createDemoUser()
            setUser(demoUser)
            return
          }
          throw new Error(
            `Demo mode: Use ${DEMO_EMAIL} / ${DEMO_PASSWORD} to continue`,
          )
        }
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        setUser(cred.user)
      },

      async loginWithEmailPassword(email: string, password: string) {
        // Demo mode: accept demo credentials
        if (!isFirebaseConfigured || !auth) {
          if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
            localStorage.setItem('demo-session', 'true')
            const demoUser = createDemoUser()
            setUser(demoUser)
            return
          }
          throw new Error(
            `Demo mode: Use ${DEMO_EMAIL} / ${DEMO_PASSWORD} to sign in`,
          )
        }
        const cred = await signInWithEmailAndPassword(auth, email, password)
        setUser(cred.user)
      },

      async loginWithGoogle() {
        // Demo mode: not supported without Firebase
        if (!isFirebaseConfigured || !auth) {
          throw new Error(
            `Google sign-in not available in demo mode. Use ${DEMO_EMAIL} / ${DEMO_PASSWORD}`,
          )
        }
        if (!googleProvider) {
          throw new Error('Google sign-in is not available because Firebase is not configured.')
        }
        const cred = await signInWithPopup(auth, googleProvider)
        setUser(cred.user)
      },

      async signOut() {
        if (!isFirebaseConfigured || !auth) {
          // In dev mode, clear demo session
          localStorage.removeItem('demo-session')
          setUser(null)
          return
        }
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
