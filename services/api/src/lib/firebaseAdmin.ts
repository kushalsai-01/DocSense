import { getApps, initializeApp, cert, App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import cfg from './config'

let firebaseApp: App | null = null

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, '\n')
}

export function isFirebaseAdminConfigured(): boolean {
  return Boolean(cfg.firebaseProjectId && cfg.firebaseClientEmail && cfg.firebasePrivateKey)
}

export function getFirebaseAdminAuth() {
  if (!isFirebaseAdminConfigured()) {
    throw new Error('Firebase Admin is not configured')
  }

  if (firebaseApp) return getAuth(firebaseApp)

  if (getApps().length > 0) {
    firebaseApp = getApps()[0]!
    return getAuth(firebaseApp)
  }

  firebaseApp = initializeApp({
    credential: cert({
      projectId: cfg.firebaseProjectId!,
      clientEmail: cfg.firebaseClientEmail!,
      privateKey: normalizePrivateKey(cfg.firebasePrivateKey!),
    }),
  })

  return getAuth(firebaseApp)
}
