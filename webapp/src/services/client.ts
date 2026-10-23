export type Role = 'admin' | 'agent' | 'user'
export type UserStatus = 'active' | 'disabled'
export type TicketStatus = 'pending' | 'in_progress' | 'resolved' | 'closed' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export type User = {
  id: string
  username: string
  displayName: string | null
  role: Role
  status: UserStatus
}

export type Ticket = {
  id: string
  title: string
  description: string
  categoryId: string
  priority: Priority
  status: TicketStatus
  requesterId: string
  handlerId: string | null
  createdAt: string
  updatedAt: string
}

export type Category = {
  id: string
  name: string
  description: string | null
  enabled: boolean
}

export type Comment = {
  id: string
  ticketId: string
  authorId: string
  body: string
  kind: 'public' | 'internal'
  createdAt: string
}

export type PageMeta = { page: number; pageSize: number; total: number; totalPages: number }
export type TokenSession = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: User
}

type Envelope<T> = {
  data?: T
  message?: string
  code?: string
  errors?: { message?: string[]; stack?: string }
  meta?: PageMeta
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code = 'REQUEST_FAILED') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const errorMessages: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: '用户名或密码错误。',
  AUTH_ACCOUNT_DISABLED: '此账户已停用，请联系管理员。',
  AUTH_ACCOUNT_LOCKED: '登录尝试过多，账户已暂时锁定，请稍后再试。',
  AUTH_RATE_LIMITED: '登录请求过于频繁，请稍后再试。',
  AUTH_INVALID_REFRESH_TOKEN: '登录状态已失效，请重新登录。',
  UNAUTHORIZED: '登录状态已失效，请重新登录。',
  FORBIDDEN: '当前账户无权执行此操作。',
  USER_NOT_FOUND: '未找到该用户。',
  USERNAME_TAKEN: '该用户名已被使用。',
  SELF_MODIFICATION_FORBIDDEN: '不能修改自己的角色或账户状态。',
  CATEGORY_NOT_FOUND: '未找到该分类。',
  CATEGORY_NAME_TAKEN: '该分类名称已存在。',
  INVALID_CATEGORY: '分类不存在或已停用，请重新选择。',
  TICKET_NOT_FOUND: '未找到该工单。',
  INVALID_STATE_TRANSITION: '当前工单状态不允许此操作。',
  INVALID_HANDLER: '处理人必须是已启用的处理人员或管理员。',
  VALIDATION_ERROR: '提交内容不符合要求，请检查表单。',
}

let currentSession: TokenSession | null = null
const sessionListeners = new Set<(session: TokenSession | null) => void>()
let refreshPromise: Promise<boolean> | null = null

export const getSession = () => currentSession

export const setSession = (session: TokenSession | null) => {
  currentSession = session
  for (const listener of sessionListeners) listener(session)
}

export const subscribeSession = (listener: (session: TokenSession | null) => void) => {
  sessionListeners.add(listener)
  return () => {
    sessionListeners.delete(listener)
  }
}

const readEnvelope = async <T>(response: Response): Promise<Envelope<T>> => {
  try {
    return (await response.json()) as Envelope<T>
  } catch {
    return {}
  }
}

const refreshSession = async (): Promise<boolean> => {
  if (refreshPromise) return refreshPromise
  const previous = currentSession
  if (!previous?.refreshToken) return false

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: previous.refreshToken }),
      })
      const envelope = await readEnvelope<Omit<TokenSession, 'user'>>(response)
      if (!response.ok || !envelope.data) throw new Error('Session refresh failed')
      setSession({ ...previous, ...envelope.data })
      return true
    } catch {
      setSession(null)
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export const request = async <T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> => {
  const send = () => {
    const headers = new Headers(init.headers)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    if (currentSession?.accessToken)
      headers.set('Authorization', `Bearer ${currentSession.accessToken}`)
    return fetch(path, { ...init, headers })
  }

  let response = await send()
  if (response.status === 401 && currentSession?.refreshToken && !path.endsWith('/auth/refresh')) {
    if (await refreshSession()) {
      if (path.endsWith('/auth/logout') && currentSession && init.body) {
        init = { ...init, body: JSON.stringify({ refreshToken: currentSession.refreshToken }) }
      }
      response = await send()
    }
  }

  const envelope = await readEnvelope<T>(response)
  if (!response.ok) {
    const message =
      errorMessages[envelope.code ?? ''] ||
      envelope.errors?.message?.join('；') ||
      envelope.message ||
      `请求失败（${response.status}）`
    throw new ApiError(message, response.status, envelope.code)
  }
  return envelope
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
}

export const queryString = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).length > 0) params.set(key, String(value))
  }
  return params.toString()
}

export const displayName = (user?: Pick<User, 'displayName' | 'username'> | null) =>
  user?.displayName || user?.username || '未知用户'

export const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—'
