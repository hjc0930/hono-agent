import { Navigate, Route, Routes, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { useAuth } from './hooks/useAuth.tsx'
import { AppShell, NotFound } from './components/index.tsx'
import { LoginPage } from './views/LoginView.tsx'
import { TicketsPage } from './views/tickets/TicketsView.tsx'
import { NewTicketPage } from './views/tickets/NewTicketView.tsx'
import { TicketDetailPage } from './views/tickets/TicketDetailView.tsx'
import { UsersPage } from './views/users/UsersView.tsx'
import { CategoriesPage } from './views/categories/CategoriesView.tsx'

const ProtectedRoute = () => {
  const { session } = useAuth()
  const location = useLocation()
  return session ? (
    <AppShell />
  ) : (
    <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  )
}

const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth()
  return session?.user.role === 'admin' ? children : <Navigate to="/tickets" replace />
}

const LoginRoute = () => {
  const { session } = useAuth()
  return session ? <Navigate to="/tickets" replace /> : <LoginPage />
}

const App = () => (
  <Routes>
    <Route element={<LoginRoute />} path="/login" />
    <Route element={<ProtectedRoute />}>
      <Route element={<TicketsPage />} path="/tickets" />
      <Route element={<NewTicketPage />} path="/tickets/new" />
      <Route element={<TicketDetailPage />} path="/tickets/:id" />
      <Route element={<CategoriesPage />} path="/categories" />
      <Route
        element={
          <AdminRoute>
            <UsersPage />
          </AdminRoute>
        }
        path="/users"
      />
      <Route element={<Navigate replace to="/tickets" />} path="/" />
    </Route>
    <Route element={<NotFound />} path="*" />
  </Routes>
)

export default App
