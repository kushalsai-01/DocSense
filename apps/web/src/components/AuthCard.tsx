import { type FormEvent, useState } from 'react'
import Logo from './Logo'
import { Button, Input } from './ui'
import { isFirebaseConfigured } from '../auth/firebase'

type AuthMode = 'login' | 'signup'

type Credentials = {
  email: string
  password: string
}

type Props = {
  initialMode?: AuthMode
  initialEmail?: string
  isLoading?: boolean
  errorMessage?: string
  onLogin?: (creds: Credentials) => void | Promise<void>
  onSignup?: (creds: Credentials) => void | Promise<void>
  onGoogleSignIn?: (mode: AuthMode) => void | Promise<void>
  title?: string
  subtitle?: string
}

export default function AuthCard({
  initialMode = 'login',
  initialEmail = '',
  isLoading = false,
  errorMessage,
  onLogin,
  onSignup,
  onGoogleSignIn,
  subtitle = 'Sign in or create an account to continue.',
}: Props) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const creds = { email: email.trim(), password }
    if (mode === 'login') {
      await onLogin?.(creds)
    } else {
      await onSignup?.(creds)
    }
  }

  async function handleGoogle() {
    await onGoogleSignIn?.(mode)
  }

  return (
    <section
      aria-label="Authentication"
      className="w-full max-w-sm animate-fade-in"
    >
      {/* Logo */}
      <div className="mb-8 text-center">
        <Logo size="lg" />
        <p className="mt-2 text-sm text-zinc-400">{subtitle}</p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-zinc-800/60 bg-surface-raised p-6 shadow-lg shadow-black/20">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 ${
              mode === 'login'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            onClick={() => setMode('login')}
            disabled={isLoading}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 ${
              mode === 'signup'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            onClick={() => setMode('signup')}
            disabled={isLoading}
          >
            Create account
          </button>
        </div>

        {/* Demo credentials notice (when Firebase is not configured) */}
        {!isFirebaseConfigured && (
          <div className="mt-4 rounded-lg border border-brand-500/20 bg-brand-500/5 px-3 py-2.5">
            <p className="text-xs font-medium text-brand-300">🎯 Demo Mode</p>
            <p className="mt-1 text-xs text-zinc-400">
              Use these credentials to sign in:
            </p>
            <p className="mt-1 font-mono text-xs text-brand-200">
              demo@docsense.app / demo123
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            placeholder="you@example.com"
          />

          <Input
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            placeholder={mode === 'login' ? 'Your password' : 'Create a password'}
          />

          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm text-red-300"
            >
              {errorMessage}
            </div>
          )}

          <Button
            type="submit"
            isLoading={isLoading}
            className="w-full"
            size="lg"
          >
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>

          {/* Divider */}
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800/60" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-surface-raised px-3 text-xs text-zinc-500">or</span>
            </div>
          </div>

          {/* Google button */}
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading}
            onClick={handleGoogle}
            className="w-full"
            size="lg"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="text-center text-2xs text-zinc-500">
            By continuing, you agree to the Terms and Privacy Policy.
          </p>
        </form>
      </div>
    </section>
  )
}
