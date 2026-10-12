import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import type { ReactNode } from 'react'
import { useAuth } from './auth.tsx'
import { displayName, type TicketStatus, type Priority } from './api.ts'

const roleLabels = { admin: '管理员', agent: '处理人员', user: '普通用户' } as const
const statusLabels: Record<TicketStatus, string> = {
  pending: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭',
  cancelled: '已取消',
}
const priorityLabels: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

export const StatusBadge = ({ status }: { status: TicketStatus }) => (
  <span className={`badge status-${status}`}>{statusLabels[status]}</span>
)

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={`badge priority-${priority}`}>{priorityLabels[priority]}</span>
)

export const PageHeader = ({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
}) => (
  <div className="page-heading">
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
    </div>
    {action}
  </div>
)

export const Loading = ({ label = '正在加载…' }: { label?: string }) => (
  <div className="state-card" role="status">
    <span className="spinner" />
    {label}
  </div>
)

export const ErrorState = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <div className="state-card error-state" role="alert">
    <span>{error instanceof Error ? error.message : '加载失败，请稍后重试。'}</span>
    {retry && (
      <button className="button button-secondary" onClick={retry} type="button">
        重试
      </button>
    )}
  </div>
)

export const EmptyState = ({ title, detail }: { title: string; detail?: string }) => (
  <div className="empty-state">
    <span className="empty-mark">✳</span>
    <strong>{title}</strong>
    {detail && <span>{detail}</span>}
  </div>
)

export const FieldError = ({ children }: { children?: ReactNode }) =>
  children ? (
    <span className="field-error" role="alert">
      {children}
    </span>
  ) : null

export const AppShell = () => {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  if (!session) return null

  const active = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`
  const handleLogout = async () => {
    await logout().catch(() => undefined)
    navigate('/login', { replace: true, state: { from: location.pathname } })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/tickets" className="brand">
          <span className="brand-mark">H</span>
          <span>
            Hono Agent<small>服务工单工作台</small>
          </span>
        </Link>
        <div className="nav-caption">工作区</div>
        <nav aria-label="主导航" className="main-nav">
          <NavLink className={active} to="/tickets">
            <span className="nav-symbol">▤</span>工单
          </NavLink>
          <NavLink className={active} to="/tickets/new">
            <span className="nav-symbol">＋</span>新建工单
          </NavLink>
          <NavLink className={active} to="/categories">
            <span className="nav-symbol">◇</span>工单分类
          </NavLink>
          {session.user.role === 'admin' && (
            <NavLink className={active} to="/users">
              <span className="nav-symbol">♙</span>用户管理
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-avatar">
            {displayName(session.user).slice(0, 1).toUpperCase()}
          </div>
          <div className="profile-copy">
            <strong>{displayName(session.user)}</strong>
            <span>{roleLabels[session.user.role]}</span>
          </div>
          <button
            className="icon-button logout-button"
            aria-label="退出登录"
            title="退出登录"
            onClick={handleLogout}
            type="button"
          >
            ↗
          </button>
        </div>
      </aside>
      <main className="main-area">
        <Outlet />
      </main>
    </div>
  )
}

export const NotFound = () => {
  const { session } = useAuth()
  const home = session ? '/tickets' : '/login'
  return (
    <main className="not-found">
      <div className="eyebrow">404 · 页面不存在</div>
      <h1>找不到这个页面</h1>
      <p className="muted">链接可能已失效，或者地址输入有误。</p>
      <Link className="button button-primary" to={home}>
        返回{session ? '工单' : '登录'}
      </Link>
    </main>
  )
}

export const RoleLabel = ({ role }: { role: keyof typeof roleLabels }) => (
  <span className={`role-pill role-${role}`}>{roleLabels[role]}</span>
)
export const ticketStatusText = (status: TicketStatus) => statusLabels[status]
export const priorityText = (priority: Priority) => priorityLabels[priority]
