import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const requiredFirebaseEnv = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] as const

export const isFirebaseConfigured = requiredFirebaseEnv.every((k) => Boolean(import.meta.env[k]))

let firebaseApp: ReturnType<typeof initializeApp> | undefined
let auth: ReturnType<typeof getAuth> | undefined
let googleProvider: GoogleAuthProvider | undefined

if (isFirebaseConfigured) {
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string,

    // Optional
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
  }

  firebaseApp = initializeApp(firebaseConfig)
  auth = getAuth(firebaseApp)
  googleProvider = new GoogleAuthProvider()
} else {
  // Intentionally do not throw: allow the landing page to render without
  // Firebase configured. Auth flows will fail with a clear runtime error.
  console.warn(
    `[DocSense] Firebase is not configured. Set ${requiredFirebaseEnv.join(', ')} (Vite VITE_* vars) and rebuild to enable authentication.`,
  )
}

export { firebaseApp, auth, googleProvider }
