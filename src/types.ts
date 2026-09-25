export type UserRole = 'admin' | 'agent' | 'user'

export type UserStatus = 'active' | 'disabled'

export type AppVariables = {
  requestId: string
  userId: string
  userRole: UserRole
}
