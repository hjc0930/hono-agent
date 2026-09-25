export type UserRole = 'admin' | 'agent' | 'user'

export type UserStatus = 'active' | 'disabled'

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export type TicketStatus = 'pending' | 'in_progress' | 'resolved' | 'closed' | 'cancelled'

export type CommentKind = 'public' | 'internal'

export type AppVariables = {
  requestId: string
  userId: string
  userRole: UserRole
}
