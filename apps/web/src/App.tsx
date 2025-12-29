import { Route, Routes } from 'react-router-dom'
import AuthGuard from './auth/AuthGuard'
import AppHome from './routes/AppHome'
import AuthPage from './routes/AuthPage'
import LandingPage from './routes/LandingPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/app"
        element={
          <AuthGuard>
            <AppHome />
          </AuthGuard>
        }
      />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  )
}
