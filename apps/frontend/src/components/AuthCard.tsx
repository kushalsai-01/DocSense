import { type FormEvent, useId, useMemo, useState } from 'react'

type AuthMode = 'login' | 'signup'

type Credentials = {
  email: string
  password: string
}

type Props = {
  initialMode?: AuthMode
  initialEmail?: string

  // When true, disables inputs/buttons.
  isLoading?: boolean

  // Optional external error message to display.
  errorMessage?: string

  // Called on form submit.
  onLogin?: (creds: Credentials) => void | Promise<void>
  onSignup?: (creds: Credentials) => void | Promise<void>

  // Placeholder hook for Google sign-in.
  onGoogleSignIn?: (mode: AuthMode) => void | Promise<void>

  // Optional CTA labels (useful for white-labeling).
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
  title = 'Welcome',
  subtitle = 'Sign in or create an account to continue.',
}: Props) {
  const emailId = useId()
  const passwordId = useId()

  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')

  const modeLabel = mode === 'login' ? 'Login' : 'Sign up'
  const submitLabel = useMemo(() => {
    if (isLoading) return 'Please wait…'
    return mode === 'login' ? 'Login' : 'Create account'
  }, [mode, isLoading])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const creds = {
      email: email.trim(),
      password,
    }

    if (mode === 'login') {
      await onLogin?.(creds)
      return
    }

    await onSignup?.(creds)
  }

  async function handleGoogle() {
    await onGoogleSignIn?.(mode)
  }

  return (
    <section
      aria-label="Authentication"
      className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 shadow-sm"
    >
      <header className="text-center">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">{title}</h2>
        <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
      </header>

      <div className="mt-6">
        <div
          role="tablist"
          aria-label="Authentication mode"
          className="grid grid-cols-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={
              mode === 'login'
                ? 'rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900'
                : 'rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900'
            }
            onClick={() => setMode('login')}
            disabled={isLoading}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={
              mode === 'signup'
                ? 'rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900'
                : 'rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900'
            }
            onClick={() => setMode('signup')}
            disabled={isLoading}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor={emailId} className="block text-sm font-medium text-zinc-200">
              Email
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="mt-1 block w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/60"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor={passwordId} className="block text-sm font-medium text-zinc-200">
                Password
              </label>
              <span className="text-xs text-zinc-500">{modeLabel}</span>
            </div>
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="mt-1 block w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/60"
              placeholder={mode === 'login' ? 'Your password' : 'Create a password'}
            />
          </div>

          {errorMessage ? (
            <div
              role="alert"
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            >
              {errorMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center rounded-md bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitLabel}
          </button>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-zinc-950 px-2 text-xs text-zinc-500">or</span>
            </div>
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={handleGoogle}
            className="inline-flex w-full items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Continue with Google
          </button>

          <p className="text-center text-xs text-zinc-500">
            By continuing, you agree to the Terms and Privacy Policy.
          </p>
        </form>
      </div>
    </section>
  )
}
