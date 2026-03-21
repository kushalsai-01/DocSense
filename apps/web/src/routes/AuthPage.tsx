import { zodResolver } from '@hookform/resolvers/zod'
import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { auth, googleProvider, isFirebaseConfigured } from '../auth/firebase'
import { signInWithPopup } from 'firebase/auth'

// ── Schemas ───────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

type LoginForm = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

// ── Password strength ─────────────────────────────────────────────────

function passwordStrength(pw: string): { label: string; color: string; width: string } {
  if (pw.length === 0) return { label: '', color: 'bg-gray-700', width: 'w-0' }
  if (pw.length < 6) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/4' }
  if (pw.length < 10) return { label: 'Fair', color: 'bg-yellow-500', width: 'w-1/2' }
  if (!/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return { label: 'Good', color: 'bg-blue-500', width: 'w-3/4' }
  return { label: 'Strong', color: 'bg-green-500', width: 'w-full' }
}

// ── Component ─────────────────────────────────────────────────────────

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const { login, register, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })
  const watchedPassword = registerForm.watch('password', '')
  const strength = passwordStrength(watchedPassword)

  async function handleLogin(values: LoginForm) {
    try {
      await login(values.email, values.password)
      navigate('/documents')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      loginForm.setError('password', { message: msg })
    }
  }

  async function handleRegister(values: RegisterForm) {
    try {
      await register(values.name, values.email, values.password)
      toast.success('Account created! Welcome to DocSense.')
      navigate('/documents')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      registerForm.setError('email', { message: msg })
    }
  }

  async function handleGoogleSignIn() {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      toast.error('Google auth is not configured yet. Set VITE_FIREBASE_* env vars and redeploy.')
      return
    }
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const idToken = await result.user.getIdToken()
      await loginWithGoogle(idToken)
      toast.success('Signed in with Google')
      navigate('/documents')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed'
      toast.error(msg)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">DocSense</h1>
          <p className="mt-1 text-sm text-gray-400">Document intelligence powered by AI</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-xl">
          {/* Tab toggle */}
          <div className="mb-6 flex rounded-xl bg-gray-800 p-1">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === 'register' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Register
            </button>
          </div>

          {/* Login form */}
          {mode === 'login' && (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-300">Email</label>
                <input
                  {...loginForm.register('email')}
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  placeholder="you@example.com"
                />
                {loginForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-red-400">{loginForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-300">Password</label>
                <input
                  {...loginForm.register('password')}
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  placeholder="••••••••"
                />
                {loginForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-red-400">{loginForm.formState.errors.password.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={loginForm.formState.isSubmitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {loginForm.formState.isSubmitting ? 'Signing in…' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 text-sm font-semibold text-white hover:border-gray-600 disabled:opacity-50"
              >
                Continue with Google
              </button>
            </form>
          )}

          {/* Register form */}
          {mode === 'register' && (
            <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-300">Name</label>
                <input
                  {...registerForm.register('name')}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  placeholder="Jane Doe"
                />
                {registerForm.formState.errors.name && (
                  <p className="mt-1 text-xs text-red-400">{registerForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-300">Email</label>
                <input
                  {...registerForm.register('email')}
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  placeholder="you@example.com"
                />
                {registerForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-red-400">{registerForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-300">Password</label>
                <input
                  {...registerForm.register('password')}
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  placeholder="••••••••"
                />
                {watchedPassword && (
                  <div className="mt-1.5">
                    <div className="h-1 w-full rounded-full bg-gray-700">
                      <div className={`h-1 rounded-full transition-all ${strength.color} ${strength.width}`} />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">{strength.label}</p>
                  </div>
                )}
                {registerForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-red-400">{registerForm.formState.errors.password.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-300">Confirm Password</label>
                <input
                  {...registerForm.register('confirmPassword')}
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  placeholder="••••••••"
                />
                {registerForm.formState.errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-400">{registerForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={registerForm.formState.isSubmitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {registerForm.formState.isSubmitting ? 'Creating account…' : 'Create Account'}
              </button>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 text-sm font-semibold text-white hover:border-gray-600 disabled:opacity-50"
              >
                Continue with Google
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
