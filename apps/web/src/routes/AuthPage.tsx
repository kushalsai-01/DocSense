import { FirebaseError } from 'firebase/app'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import { useAuth } from '../auth/AuthContext'

function friendlyFirebaseError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return 'Invalid email or password.'
      case 'auth/user-not-found':
        return 'No account found for that email.'
      case 'auth/email-already-in-use':
        return 'That email is already in use.'
      case 'auth/weak-password':
        return 'Password is too weak.'
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was cancelled.'
      default:
        return 'Authentication failed. Please try again.'
    }
  }
  return 'Something went wrong. Please try again.'
}

export default function AuthPage() {
  const navigate = useNavigate()
  const { user, signupWithEmailPassword, loginWithEmailPassword, loginWithGoogle } = useAuth()

  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)

  const subtitle = useMemo(() => {
    if (user) return 'You are already signed in.'
    return 'Sign in or create an account to continue.'
  }, [user])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-16">
        <AuthCard
          title="DocSense"
          subtitle={subtitle}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onLogin={async ({ email, password }) => {
            setErrorMessage(undefined)
            setIsLoading(true)
            try {
              await loginWithEmailPassword(email, password)
              navigate('/app', { replace: true })
            } catch (e) {
              setErrorMessage(friendlyFirebaseError(e))
            } finally {
              setIsLoading(false)
            }
          }}
          onSignup={async ({ email, password }) => {
            setErrorMessage(undefined)
            setIsLoading(true)
            try {
              await signupWithEmailPassword(email, password)
              navigate('/app', { replace: true })
            } catch (e) {
              setErrorMessage(friendlyFirebaseError(e))
            } finally {
              setIsLoading(false)
            }
          }}
          onGoogleSignIn={async () => {
            setErrorMessage(undefined)
            setIsLoading(true)
            try {
              await loginWithGoogle()
              navigate('/app', { replace: true })
            } catch (e) {
              setErrorMessage(friendlyFirebaseError(e))
            } finally {
              setIsLoading(false)
            }
          }}
        />
      </main>
    </div>
  )
}
