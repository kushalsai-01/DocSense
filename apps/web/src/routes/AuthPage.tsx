import { FirebaseError } from 'firebase/app'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import { useAuth } from '../auth/AuthContext'
import { IconChevronLeft } from '../components/ui/Icons'

function friendlyFirebaseError(err: unknown): string {
  if (err instanceof Error && /Firebase is not configured/i.test(err.message)) {
    return err.message
  }
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
  const { user, isLoading: isAuthLoading, signupWithEmailPassword, loginWithEmailPassword, loginWithGoogle } = useAuth()

  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)

  const subtitle = useMemo(() => {
    if (user) return 'You are already signed in.'
    return 'Sign in or create an account to continue.'
  }, [user])

  useEffect(() => {
    if (isAuthLoading) return
    if (user) {
      navigate('/app', { replace: true })
    }
  }, [user, isAuthLoading, navigate])

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-surface px-6 py-16">
      {/* Back link */}
      <Link
        to="/"
        className="absolute left-6 top-6 flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <IconChevronLeft className="h-4 w-4" />
        Home
      </Link>

      {/* Subtle glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[400px] w-[400px] rounded-full bg-brand-600/5 blur-3xl" />
      </div>

      <AuthCard
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
    </div>
  )
}
