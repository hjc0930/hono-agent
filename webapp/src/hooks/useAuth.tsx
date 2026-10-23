import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  api,
  getSession,
  setSession,
  subscribeSession,
  type TokenSession,
  type User,
} from '../services/client.ts'

type AuthContextValue = {
  session: TokenSession | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setCurrent] = useState<TokenSession | null>(() => getSession())
  const queryClient = useQueryClient()

  useEffect(() => subscribeSession(setCurrent), [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      async login(username, password) {
        const result = await api.post<TokenSession>('/api/auth/login', { username, password })
        if (!result.data) throw new Error('登录响应缺少会话信息')
        setSession(result.data)
        try {
          const current = await api.get<User>('/api/auth/me')
          if (current.data) setSession({ ...result.data, user: current.data })
        } catch (error) {
          setSession(null)
          throw error
        }
      },
      async logout() {
        const active = getSession()
        try {
          if (active) await api.post('/api/auth/logout', { refreshToken: active.refreshToken })
        } finally {
          setSession(null)
          queryClient.clear()
        }
      },
      updateUser(user) {
        const active = getSession()
        if (active) setSession({ ...active, user })
      },
    }),
    [queryClient, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
