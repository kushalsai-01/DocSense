import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
          <p className="text-sm text-zinc-400">Loading…</p>
        </main>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
