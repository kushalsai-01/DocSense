import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthGuard } from './auth/AuthGuard'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import AuthPage from './routes/AuthPage'
import LandingPage from './routes/LandingPage'
import DocumentsPage from './pages/Documents'
import DocumentDetailPage from './pages/DocumentDetail'
import QueryPage from './pages/Query'
import AnalyticsPage from './pages/Analytics'
import SettingsPage from './pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function AppShell() {
  return (
    <AuthGuard>
      <Layout>
        <Outlet />
      </Layout>
    </AuthGuard>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1f2937', color: '#f9fafb', border: '1px solid #374151' },
            success: { iconTheme: { primary: '#6366f1', secondary: '#fff' } },
          }}
        />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />

          <Route element={<AppShell />}>
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:docId" element={<DocumentDetailPage />} />
            <Route path="/query" element={<QueryPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </QueryClientProvider>
  )
}
