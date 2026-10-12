import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useState, type FormEvent } from 'react'
import {
  api,
  displayName,
  formatDate,
  queryString,
  type Category,
  type Comment,
  type PageMeta,
  type Priority,
  type Role,
  type Ticket,
  type TicketStatus,
  type User,
} from './api.ts'
import { useAuth } from './auth.tsx'
import {
  EmptyState,
  ErrorState,
  FieldError,
  Loading,
  PageHeader,
  PriorityBadge,
  StatusBadge,
} from './components.tsx'

const roleText: Record<Role, string> = { admin: '管理员', agent: '处理人员', user: '普通用户' }
const statusOptions: Array<[TicketStatus, string]> = [
  ['pending', '待处理'],
  ['in_progress', '处理中'],
  ['resolved', '已解决'],
  ['closed', '已关闭'],
  ['cancelled', '已取消'],
]
const priorityOptions: Array<[Priority, string]> = [
  ['low', '低'],
  ['medium', '中'],
  ['high', '高'],
  ['urgent', '紧急'],
]
const statusTargetText: Record<string, string> = Object.fromEntries(statusOptions)

const validateLogin = (username: string, password: string) => {
  if (!/^[a-z0-9_-]{3,32}$/.test(username))
    return '用户名须为 3–32 位小写字母、数字、下划线或连字符。'
  if (password.length < 8 || password.length > 128) return '密码长度须为 8–128 位。'
  return ''
}

export const LoginPage = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => {
      const invalid = validateLogin(username, password)
      if (invalid) throw new Error(invalid)
      return login(username, password)
    },
    onSuccess: () => {
      const from = (location.state as { from?: string } | null)?.from
      navigate(from?.startsWith('/') && from !== '/login' ? from : '/tickets', { replace: true })
    },
    onError: (reason) =>
      setError(reason instanceof Error ? reason.message : '登录失败，请稍后重试。'),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError('')
    mutation.mutate()
  }

  return (
    <main className="login-layout">
      <section className="login-aside">
        <Link to="/login" className="brand brand-light">
          <span className="brand-mark">H</span>
          <span>
            Hono Agent<small>服务工单工作台</small>
          </span>
        </Link>
        <div className="login-message">
          <span className="eyebrow">SUPPORT OPERATIONS</span>
          <h1>
            每一条请求，
            <br />
            都有清晰的进展。
          </h1>
          <p>统一处理客户问题、协作记录与服务流程。</p>
        </div>
        <div className="login-aside-footer">安全登录 · 角色权限保护</div>
      </section>
      <section className="login-main">
        <div className="login-card">
          <div className="eyebrow">欢迎回来</div>
          <h2>登录工作台</h2>
          <p className="muted">使用管理员分配的账户继续工作。</p>
          <form className="form-stack login-form" onSubmit={submit}>
            <label>
              用户名
              <input
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={32}
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={128}
                required
              />
            </label>
            {error && (
              <div className="inline-alert" role="alert">
                {error}
              </div>
            )}
            <button
              className="button button-primary button-wide"
              disabled={mutation.isPending}
              type="submit"
            >
              {mutation.isPending ? '正在登录…' : '登录'}
            </button>
          </form>
          <p className="login-footnote">登录信息仅用于身份验证，不会保存在浏览器持久存储中。</p>
        </div>
      </section>
    </main>
  )
}

const getCategoryNames = async () => {
  const response = await api.get<Category[]>(
    '/api/ticket-categories?page=1&pageSize=100&enabled=true',
  )
  return response.data ?? []
}
const getUsers = async () => {
  const response = await api.get<User[]>('/api/users?page=1&pageSize=100&status=active')
  return response.data ?? []
}

const getAllUsers = async () => {
  const response = await api.get<User[]>('/api/users?page=1&pageSize=100')
  return response.data ?? []
}

const DateInput = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) => (
  <label>
    {label}
    <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
  </label>
)

export const TicketsPage = () => {
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const query = Object.fromEntries(params.entries())
  const page = Math.max(1, Number(query.page || 1))
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)))
  const filters = {
    status: query.status,
    priority: query.priority,
    categoryId: query.categoryId,
    requesterId: query.requesterId,
    handlerId: query.handlerId,
    keyword: query.keyword,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
  }
  const apiQuery = queryString({ page, pageSize, ...filters })
  const tickets = useQuery({
    queryKey: ['tickets', apiQuery],
    queryFn: async () => {
      const response = await api.get<Ticket[]>(`/api/tickets?${apiQuery}`)
      return { rows: response.data ?? [], meta: response.meta as PageMeta }
    },
  })
  const categories = useQuery({ queryKey: ['categories', 'enabled'], queryFn: getCategoryNames })
  const users = useQuery({
    queryKey: ['users', 'all-options'],
    queryFn: getAllUsers,
    enabled: session?.user.role === 'admin',
  })
  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    next.set('page', '1')
    setParams(next)
  }
  const reset = () => setParams(new URLSearchParams())

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="客户支持"
        title="工单"
        description="集中查看、筛选和跟进服务请求。"
        action={
          <Link className="button button-primary" to="/tickets/new">
            ＋ 新建工单
          </Link>
        }
      />
      <section className="panel filter-panel">
        <div className="filter-heading">
          <div>
            <strong>筛选工单</strong>
            <span className="muted">根据状态、优先级或关键词缩小范围</span>
          </div>
          <button className="text-button" onClick={reset} type="button">
            清除筛选
          </button>
        </div>
        <div className="filter-grid">
          <label>
            关键词
            <input
              placeholder="搜索标题或描述"
              value={query.keyword || ''}
              onChange={(event) => setFilter('keyword', event.target.value)}
            />
          </label>
          <label>
            状态
            <select
              value={query.status || ''}
              onChange={(event) => setFilter('status', event.target.value)}
            >
              <option value="">全部状态</option>
              {statusOptions.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            优先级
            <select
              value={query.priority || ''}
              onChange={(event) => setFilter('priority', event.target.value)}
            >
              <option value="">全部优先级</option>
              {priorityOptions.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            工单分类
            <select
              value={query.categoryId || ''}
              onChange={(event) => setFilter('categoryId', event.target.value)}
            >
              <option value="">全部分类</option>
              {(categories.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {session?.user.role === 'admin' && (
            <>
              <label>
                提交人
                <select
                  value={query.requesterId || ''}
                  onChange={(event) => setFilter('requesterId', event.target.value)}
                >
                  <option value="">全部提交人</option>
                  {(users.data ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {displayName(user)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                处理人
                <select
                  value={query.handlerId || ''}
                  onChange={(event) => setFilter('handlerId', event.target.value)}
                >
                  <option value="">全部处理人</option>
                  {(users.data ?? [])
                    .filter((user) => user.role !== 'user')
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {displayName(user)}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          {session?.user.role === 'agent' && (
            <>
              <label>
                提交人 ID
                <input
                  value={query.requesterId || ''}
                  onChange={(event) => setFilter('requesterId', event.target.value)}
                  placeholder="按提交人 UUID 筛选"
                />
              </label>
              <label>
                处理人 ID
                <input
                  value={query.handlerId || ''}
                  onChange={(event) => setFilter('handlerId', event.target.value)}
                  placeholder="按处理人 UUID 筛选"
                />
              </label>
            </>
          )}
          <DateInput
            label="创建时间起"
            value={query.createdFrom || ''}
            onChange={(value) => setFilter('createdFrom', value ? `${value}T00:00:00.000Z` : '')}
          />
          <DateInput
            label="创建时间止"
            value={query.createdTo?.slice(0, 10) || ''}
            onChange={(value) => setFilter('createdTo', value ? `${value}T23:59:59.999Z` : '')}
          />
        </div>
      </section>
      <section className="panel table-panel">
        <div className="table-heading">
          <div>
            <strong>工单列表</strong>
            <span className="muted">
              {tickets.data?.meta ? `共 ${tickets.data.meta.total} 条` : '最新工单优先'}
            </span>
          </div>
        </div>
        {tickets.isPending ? (
          <Loading label="正在加载工单…" />
        ) : tickets.isError ? (
          <ErrorState error={tickets.error} retry={() => void tickets.refetch()} />
        ) : tickets.data.rows.length === 0 ? (
          <EmptyState title="没有找到工单" detail="试试调整筛选条件，或创建一条新工单。" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>工单</th>
                  <th>状态</th>
                  <th>优先级</th>
                  <th>分类</th>
                  <th>提交人</th>
                  <th>处理人</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {tickets.data.rows.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <Link className="ticket-link" to={`/tickets/${ticket.id}`}>
                        <strong>{ticket.title}</strong>
                        <small>#{ticket.id.slice(0, 8)}</small>
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td>
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td>
                      {categories.data?.find((category) => category.id === ticket.categoryId)
                        ?.name ?? '—'}
                    </td>
                    <td>
                      {users.data?.find((user) => user.id === ticket.requesterId)
                        ? displayName(users.data.find((user) => user.id === ticket.requesterId))
                        : ticket.requesterId.slice(0, 8)}
                    </td>
                    <td>
                      {users.data?.find((user) => user.id === ticket.handlerId)
                        ? displayName(users.data.find((user) => user.id === ticket.handlerId))
                        : ticket.handlerId
                          ? ticket.handlerId.slice(0, 8)
                          : '未分配'}
                    </td>
                    <td>{formatDate(ticket.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tickets.data?.meta && tickets.data.meta.totalPages > 0 && (
          <div className="pagination">
            <span>
              第 {tickets.data.meta.page} / {tickets.data.meta.totalPages} 页
            </span>
            <div>
              <button
                className="button button-secondary"
                disabled={page <= 1}
                onClick={() => setFilter('page', String(page - 1))}
                type="button"
              >
                上一页
              </button>
              <button
                className="button button-secondary"
                disabled={page >= tickets.data.meta.totalPages}
                onClick={() => setFilter('page', String(page + 1))}
                type="button"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export const NewTicketPage = () => {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [requesterId, setRequesterId] = useState('')
  const [error, setError] = useState('')
  const categories = useQuery({ queryKey: ['categories', 'enabled'], queryFn: getCategoryNames })
  const users = useQuery({
    queryKey: ['users', 'requester-options'],
    queryFn: getUsers,
    enabled: session?.user.role === 'admin',
  })
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => {
      if (!title.trim() || title.length > 200) throw new Error('标题为必填项，最多 200 个字符。')
      if (!description.trim() || description.length > 5000)
        throw new Error('描述为必填项，最多 5000 个字符。')
      if (!categoryId) throw new Error('请选择工单分类。')
      return api.post<Ticket>('/api/tickets', {
        title: title.trim(),
        description,
        categoryId,
        priority,
        ...(requesterId ? { requesterId } : {}),
      })
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] })
      if (response.data) navigate(`/tickets/${response.data.id}`)
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : '提交失败。'),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError('')
    mutation.mutate()
  }

  return (
    <div className="page-container narrow-container">
      <PageHeader
        eyebrow="工单管理"
        title="新建工单"
        description="描述问题并选择合适的分类，方便团队及时跟进。"
      />
      <form className="panel form-panel form-stack" onSubmit={submit}>
        <label>
          工单标题 <span className="required">*</span>
          <input
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="简要描述遇到的问题"
            required
          />
        </label>
        <label>
          问题描述 <span className="required">*</span>
          <textarea
            maxLength={5000}
            rows={7}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="提供问题现象、发生时间和已尝试的解决方法…"
            required
          />
          <small className="field-hint">{description.length} / 5000</small>
        </label>
        <div className="form-row">
          <label>
            工单分类 <span className="required">*</span>
            <select
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">请选择分类</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <FieldError>
              {categories.isError ? '分类加载失败，请刷新后重试。' : undefined}
            </FieldError>
          </label>
          <label>
            优先级
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
            >
              {priorityOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {session?.user.role === 'admin' && (
          <label>
            提交人 <span className="muted">（可选，默认本人）</span>
            <select value={requesterId} onChange={(event) => setRequesterId(event.target.value)}>
              <option value="">本人：{displayName(session?.user)}</option>
              {(users.data ?? [])
                .filter((user) => user.role === 'user')
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {displayName(user)} · {user.username}
                  </option>
                ))}
            </select>
          </label>
        )}
        {session?.user.role === 'agent' && (
          <label>
            代客户提交 <span className="muted">（可选，填写客户用户 ID；默认本人）</span>
            <input
              value={requesterId}
              onChange={(event) => setRequesterId(event.target.value)}
              placeholder="客户 UUID"
            />
          </label>
        )}
        {error && (
          <div className="inline-alert" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Link className="button button-secondary" to="/tickets">
            取消
          </Link>
          <button
            className="button button-primary"
            disabled={mutation.isPending || categories.isPending}
            type="submit"
          >
            {mutation.isPending ? '正在创建…' : '创建工单'}
          </button>
        </div>
      </form>
    </div>
  )
}

const allowedTargets = (ticket: Ticket, role: Role, userId: string): TicketStatus[] => {
  if (role === 'admin')
    return (
      {
        pending: ['in_progress', 'cancelled'],
        in_progress: ['resolved', 'cancelled'],
        resolved: ['closed', 'in_progress'],
        closed: [],
        cancelled: [],
      } as Record<TicketStatus, TicketStatus[]>
    )[ticket.status]
  if (ticket.status === 'resolved' && ticket.requesterId === userId)
    return ['closed', 'in_progress']
  if (['pending', 'in_progress'].includes(ticket.status) && ticket.requesterId === userId)
    return ['cancelled']
  if (role === 'agent' && ticket.status === 'in_progress') return ['resolved']
  return []
}

export const TicketDetailPage = () => {
  const location = useLocation()
  const ticketId = decodeURIComponent(location.pathname.split('/').at(-1) || '')
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const [commentBody, setCommentBody] = useState('')
  const [commentKind, setCommentKind] = useState<'public' | 'internal'>('public')
  const [actionError, setActionError] = useState('')
  const [handlerId, setHandlerId] = useState('')
  const ticket = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () =>
      (await api.get<Ticket>(`/api/tickets/${encodeURIComponent(ticketId)}`)).data as Ticket,
    enabled: Boolean(ticketId),
  })
  const comments = useQuery({
    queryKey: ['comments', ticketId],
    queryFn: async () =>
      (await api.get<Comment[]>(`/api/tickets/${encodeURIComponent(ticketId)}/comments`)).data ??
      [],
    enabled: Boolean(ticketId),
  })
  const categories = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () =>
      (await api.get<Category[]>('/api/ticket-categories?page=1&pageSize=100')).data ?? [],
  })
  const users = useQuery({
    queryKey: ['users', 'handler-options'],
    queryFn: getUsers,
    enabled: session?.user.role === 'admin',
  })
  const invalidateTicket = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] }),
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      queryClient.invalidateQueries({ queryKey: ['comments', ticketId] }),
    ])
  }
  const commentMutation = useMutation({
    mutationFn: () => {
      if (!commentBody.trim()) throw new Error('评论内容不能为空。')
      if (commentBody.length > 5000) throw new Error('评论最多 5000 个字符。')
      return api.post<Comment>(`/api/tickets/${encodeURIComponent(ticketId)}/comments`, {
        body: commentBody,
        ...(session?.user.role !== 'user' ? { kind: commentKind } : {}),
      })
    },
    onSuccess: async () => {
      setCommentBody('')
      setCommentKind('public')
      setActionError('')
      await invalidateTicket()
    },
    onError: (reason) =>
      setActionError(reason instanceof Error ? reason.message : '评论发送失败。'),
  })
  const transitionMutation = useMutation({
    mutationFn: (to: TicketStatus) =>
      api.post<Ticket>(`/api/tickets/${encodeURIComponent(ticketId)}/transition`, { to }),
    onSuccess: invalidateTicket,
    onError: (reason) =>
      setActionError(reason instanceof Error ? reason.message : '状态更新失败。'),
  })
  const assignMutation = useMutation({
    mutationFn: () => {
      if (!handlerId) throw new Error('请选择处理人。')
      return api.post<Ticket>(`/api/tickets/${encodeURIComponent(ticketId)}/assign`, { handlerId })
    },
    onSuccess: async () => {
      setHandlerId('')
      setActionError('')
      await invalidateTicket()
    },
    onError: (reason) => setActionError(reason instanceof Error ? reason.message : '分配失败。'),
  })
  if (ticket.isPending)
    return (
      <div className="page-container">
        <Loading label="正在加载工单…" />
      </div>
    )
  if (ticket.isError || !ticket.data)
    return (
      <div className="page-container">
        <ErrorState
          error={ticket.error ?? new Error('工单不存在或无权查看。')}
          retry={() => void ticket.refetch()}
        />
        <Link className="back-link" to="/tickets">
          ← 返回工单列表
        </Link>
      </div>
    )
  const item = ticket.data
  const role = session?.user.role ?? 'user'
  const targets = allowedTargets(item, role, session?.user.id ?? '')
  const canAssign = role === 'admin' && !['closed', 'cancelled'].includes(item.status)
  const categoryName =
    categories.data?.find((category) => category.id === item.categoryId)?.name ?? '未知分类'
  const userName = (id: string | null) =>
    id
      ? users.data?.find((user) => user.id === id)
        ? displayName(users.data.find((user) => user.id === id))
        : id.slice(0, 8)
      : '未分配'

  return (
    <div className="page-container detail-container">
      <Link className="back-link" to="/tickets">
        ← 返回工单列表
      </Link>
      <div className="detail-top">
        <PageHeader
          eyebrow={`工单 · ${item.id.slice(0, 8)}`}
          title={item.title}
          description={`创建于 ${formatDate(item.createdAt)} · 最近更新 ${formatDate(item.updatedAt)}`}
        />
        <div className="detail-badges">
          <StatusBadge status={item.status} />
          <PriorityBadge priority={item.priority} />
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel content-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">问题描述</span>
                <h2>工单详情</h2>
              </div>
            </div>
            <div className="description-text">{item.description}</div>
          </section>
          <section className="panel comments-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">沟通记录</span>
                <h2>
                  评论 <span className="count-pill">{comments.data?.length ?? 0}</span>
                </h2>
              </div>
            </div>
            {comments.isPending ? (
              <Loading label="正在加载评论…" />
            ) : comments.isError ? (
              <ErrorState error={comments.error} retry={() => void comments.refetch()} />
            ) : comments.data.length === 0 ? (
              <EmptyState title="还没有评论" detail="在下方添加第一条沟通记录。" />
            ) : (
              <div className="comment-list">
                {comments.data.map((comment) => (
                  <article
                    className={`comment-item ${comment.kind === 'internal' ? 'comment-internal' : ''}`}
                    key={comment.id}
                  >
                    <div className="comment-avatar">
                      {comment.authorId === item.requesterId ? '客' : '支'}
                    </div>
                    <div className="comment-content">
                      <div className="comment-meta">
                        <strong>{userName(comment.authorId)}</strong>
                        {comment.kind === 'internal' && (
                          <span className="internal-tag">内部备注</span>
                        )}
                        <time>{formatDate(comment.createdAt)}</time>
                      </div>
                      <p>{comment.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <form
              className="comment-form"
              onSubmit={(event) => {
                event.preventDefault()
                setActionError('')
                commentMutation.mutate()
              }}
            >
              <label htmlFor="comment-body">添加评论</label>
              <textarea
                id="comment-body"
                rows={4}
                maxLength={5000}
                placeholder="写下补充信息或处理进展…"
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
              />
              <div className="comment-form-bottom">
                <span className="field-hint">{commentBody.length} / 5000</span>
                <div className="comment-actions">
                  {role !== 'user' && (
                    <select
                      aria-label="评论类型"
                      value={commentKind}
                      onChange={(event) =>
                        setCommentKind(event.target.value as 'public' | 'internal')
                      }
                    >
                      <option value="public">公开回复</option>
                      <option value="internal">内部备注</option>
                    </select>
                  )}
                  <button
                    className="button button-primary"
                    disabled={commentMutation.isPending || !commentBody.trim()}
                    type="submit"
                  >
                    {commentMutation.isPending ? '发送中…' : '发送评论'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
        <aside className="detail-side">
          <section className="panel side-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">工单属性</span>
                <h2>基本信息</h2>
              </div>
            </div>
            <dl className="detail-meta">
              <div>
                <dt>分类</dt>
                <dd>{categoryName}</dd>
              </div>
              <div>
                <dt>提交人</dt>
                <dd>{userName(item.requesterId)}</dd>
              </div>
              <div>
                <dt>处理人</dt>
                <dd>{userName(item.handlerId)}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{formatDate(item.createdAt)}</dd>
              </div>
              <div>
                <dt>更新时间</dt>
                <dd>{formatDate(item.updatedAt)}</dd>
              </div>
            </dl>
          </section>
          {(targets.length > 0 || canAssign) && (
            <section className="panel side-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">可用操作</span>
                  <h2>处理工单</h2>
                </div>
              </div>
              {targets.length > 0 && (
                <div className="action-stack">
                  {targets.map((target) => (
                    <button
                      className={`button ${target === 'cancelled' ? 'button-danger' : 'button-secondary'}`}
                      disabled={transitionMutation.isPending}
                      key={target}
                      onClick={() => {
                        if (target === 'cancelled' && !window.confirm('确认取消这条工单？')) return
                        setActionError('')
                        transitionMutation.mutate(target)
                      }}
                      type="button"
                    >
                      {target === 'in_progress' && item.status === 'resolved'
                        ? '重新打开'
                        : `设为${statusTargetText[target]}`}
                    </button>
                  ))}
                </div>
              )}
              {canAssign && (
                <form
                  className="assign-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setActionError('')
                    assignMutation.mutate()
                  }}
                >
                  <label>
                    分配处理人
                    <select
                      required
                      value={handlerId}
                      onChange={(event) => setHandlerId(event.target.value)}
                    >
                      <option value="">请选择处理人</option>
                      {(users.data ?? [])
                        .filter((user) => user.status === 'active' && user.role !== 'user')
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {displayName(user)} · {roleText[user.role]}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="button button-primary button-wide"
                    disabled={assignMutation.isPending || users.isPending}
                    type="submit"
                  >
                    {assignMutation.isPending
                      ? '正在分配…'
                      : item.handlerId
                        ? '重新分配'
                        : '分配工单'}
                  </button>
                </form>
              )}
              {actionError && (
                <div className="inline-alert" role="alert">
                  {actionError}
                </div>
              )}
            </section>
          )}
          {actionError && !(targets.length > 0 || canAssign) && (
            <div className="inline-alert" role="alert">
              {actionError}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

const UserForm = ({
  initial,
  onCancel,
  onSave,
  pending,
}: {
  initial?: User
  onCancel: () => void
  onSave: (value: Record<string, unknown>) => void
  pending: boolean
}) => {
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState('')
  const [display, setDisplay] = useState(initial?.displayName ?? '')
  const [role, setRole] = useState<Role>(initial?.role ?? 'user')
  const [status, setStatus] = useState<User['status']>(initial?.status ?? 'active')
  const [error, setError] = useState('')
  return (
    <form
      className="panel form-panel form-stack"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        if (!initial && !/^[a-z0-9_-]{3,32}$/.test(username))
          return setError('用户名须为 3–32 位小写字母、数字、下划线或连字符。')
        if ((!initial || password) && (password.length < 8 || password.length > 128))
          return setError('密码长度须为 8–128 位。')
        onSave(
          initial
            ? { displayName: display || null, role, status }
            : { username, password, ...(display ? { displayName: display } : {}), role },
        )
      }}
    >
      {!initial && (
        <label>
          用户名
          <input
            autoComplete="off"
            maxLength={32}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
      )}
      {!initial && (
        <label>
          初始密码
          <input
            type="password"
            autoComplete="new-password"
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
      )}
      <label>
        显示名称
        <input
          maxLength={100}
          value={display}
          onChange={(event) => setDisplay(event.target.value)}
          placeholder="可选"
        />
      </label>
      <div className="form-row">
        <label>
          角色
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {Object.entries(roleText).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {initial && (
          <label>
            账户状态
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as User['status'])}
            >
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
        )}
      </div>
      {error && (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions">
        <button className="button button-secondary" onClick={onCancel} type="button">
          取消
        </button>
        <button className="button button-primary" disabled={pending} type="submit">
          {pending ? '保存中…' : initial ? '保存修改' : '创建用户'}
        </button>
      </div>
    </form>
  )
}

export const UsersPage = () => {
  const [params, setParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [notice, setNotice] = useState('')
  const queryClient = useQueryClient()
  const query = Object.fromEntries(params.entries())
  const page = Math.max(1, Number(query.page || 1))
  const qs = queryString({
    page,
    pageSize: 20,
    role: query.role,
    status: query.status,
    keyword: query.keyword,
  })
  const users = useQuery({
    queryKey: ['users', qs],
    queryFn: async () => {
      const response = await api.get<User[]>(`/api/users?${qs}`)
      return { rows: response.data ?? [], meta: response.meta as PageMeta }
    },
  })
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.set('page', '1')
    setParams(next)
  }
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] })
  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<User>('/api/users', body),
    onSuccess: async () => {
      setCreateOpen(false)
      setNotice('用户已创建。')
      await refresh()
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : '创建失败。'),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<User>(`/api/users/${encodeURIComponent(id)}`, body),
    onSuccess: async () => {
      setEditing(null)
      setNotice('用户信息已更新。')
      await refresh()
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : '更新失败。'),
  })
  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/api/users/${encodeURIComponent(id)}/reset-password`, { password }),
    onSuccess: () => {
      setResetting(null)
      setResetPassword('')
      setNotice('密码已重置。')
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : '重置密码失败。'),
  })

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="管理设置"
        title="用户管理"
        description="创建账户、维护角色与状态，并重置用户密码。"
        action={
          <button
            className="button button-primary"
            onClick={() => {
              setCreateOpen(true)
              setEditing(null)
              setNotice('')
            }}
            type="button"
          >
            ＋ 创建用户
          </button>
        }
      />
      {notice && (
        <div className="inline-alert notice-alert" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setNotice('')}
            type="button"
          >
            ×
          </button>
        </div>
      )}
      {createOpen && (
        <section className="editor-section">
          <div className="section-heading">
            <h2>创建用户</h2>
          </div>
          <UserForm
            pending={createMutation.isPending}
            onCancel={() => setCreateOpen(false)}
            onSave={(body) => createMutation.mutate(body)}
          />
        </section>
      )}
      {editing && (
        <section className="editor-section">
          <div className="section-heading">
            <h2>编辑 {editing.username}</h2>
          </div>
          <UserForm
            initial={editing}
            pending={updateMutation.isPending}
            onCancel={() => setEditing(null)}
            onSave={(body) => {
              if (
                body.status === 'disabled' &&
                editing.status !== 'disabled' &&
                !window.confirm('停用后该账户将无法登录。确认停用？')
              )
                return
              updateMutation.mutate({ id: editing.id, body })
            }}
          />
        </section>
      )}
      {resetting && (
        <section className="editor-section">
          <div className="section-heading">
            <h2>重置 {resetting.username} 的密码</h2>
          </div>
          <form
            className="panel compact-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (resetPassword.length < 8 || resetPassword.length > 128)
                return setNotice('新密码长度须为 8–128 位。')
              if (!window.confirm(`确认重置 ${resetting.username} 的密码？`)) return
              resetMutation.mutate({ id: resetting.id, password: resetPassword })
            }}
          >
            <label>
              新密码
              <input
                type="password"
                autoComplete="new-password"
                maxLength={128}
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                required
              />
            </label>
            <div className="form-actions">
              <button
                className="button button-secondary"
                onClick={() => {
                  setResetting(null)
                  setResetPassword('')
                }}
                type="button"
              >
                取消
              </button>
              <button
                className="button button-primary"
                disabled={resetMutation.isPending}
                type="submit"
              >
                确认重置
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="panel filter-panel">
        <div className="filter-grid">
          <label>
            关键词
            <input
              placeholder="用户名或显示名称"
              value={query.keyword || ''}
              onChange={(event) => setFilter('keyword', event.target.value)}
            />
          </label>
          <label>
            角色
            <select
              value={query.role || ''}
              onChange={(event) => setFilter('role', event.target.value)}
            >
              <option value="">全部角色</option>
              {Object.entries(roleText).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            状态
            <select
              value={query.status || ''}
              onChange={(event) => setFilter('status', event.target.value)}
            >
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="table-heading">
          <div>
            <strong>用户列表</strong>
            <span className="muted">
              {users.data?.meta ? `共 ${users.data.meta.total} 个账户` : ''}
            </span>
          </div>
        </div>
        {users.isPending ? (
          <Loading label="正在加载用户…" />
        ) : users.isError ? (
          <ErrorState error={users.error} retry={() => void users.refetch()} />
        ) : users.data.rows.length === 0 ? (
          <EmptyState title="没有匹配的用户" detail="可调整筛选条件或创建用户。" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.data.rows.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <span className="profile-avatar small-avatar">
                          {displayName(user).slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>{displayName(user)}</strong>
                          <small>@{user.username}</small>
                        </span>
                      </div>
                    </td>
                    <td>{roleText[user.role]}</td>
                    <td>
                      <span className={`user-status ${user.status}`}>
                        {user.status === 'active' ? '启用' : '已停用'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditing(user)
                            setCreateOpen(false)
                            setNotice('')
                          }}
                          type="button"
                        >
                          编辑
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            setResetting(user)
                            setResetPassword('')
                            setNotice('')
                          }}
                          type="button"
                        >
                          重置密码
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {users.data?.meta && users.data.meta.totalPages > 1 && (
          <div className="pagination">
            <span>
              第 {users.data.meta.page} / {users.data.meta.totalPages} 页
            </span>
            <div>
              <button
                className="button button-secondary"
                disabled={page <= 1}
                onClick={() => setFilter('page', String(page - 1))}
                type="button"
              >
                上一页
              </button>
              <button
                className="button button-secondary"
                disabled={page >= users.data.meta.totalPages}
                onClick={() => setFilter('page', String(page + 1))}
                type="button"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

const CategoryForm = ({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial?: Category
  pending: boolean
  onCancel: () => void
  onSave: (body: Record<string, unknown>) => void
}) => {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [error, setError] = useState('')
  return (
    <form
      className="panel form-panel form-stack"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        if (!name.trim() || name.trim().length > 64)
          return setError('名称为必填项，最多 64 个字符。')
        if (description.length > 255) return setError('描述最多 255 个字符。')
        onSave(
          initial
            ? { name: name.trim(), description: description.trim() || null, enabled }
            : {
                name: name.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
              },
        )
      }}
    >
      <label>
        分类名称 <span className="required">*</span>
        <input
          value={name}
          maxLength={64}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label>
        描述
        <textarea
          rows={3}
          value={description}
          maxLength={255}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {initial && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          启用分类
        </label>
      )}
      {error && (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions">
        <button className="button button-secondary" onClick={onCancel} type="button">
          取消
        </button>
        <button className="button button-primary" disabled={pending} type="submit">
          {pending ? '保存中…' : initial ? '保存修改' : '创建分类'}
        </button>
      </div>
    </form>
  )
}

export const CategoriesPage = () => {
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const [editor, setEditor] = useState<'create' | Category | null>(null)
  const [notice, setNotice] = useState('')
  const queryClient = useQueryClient()
  const query = Object.fromEntries(params.entries())
  const page = Math.max(1, Number(query.page || 1))
  const qs = queryString({ page, pageSize: 20, enabled: query.enabled, keyword: query.keyword })
  const categories = useQuery({
    queryKey: ['categories', qs],
    queryFn: async () => {
      const response = await api.get<Category[]>(`/api/ticket-categories?${qs}`)
      return { rows: response.data ?? [], meta: response.meta as PageMeta }
    },
  })
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.set('page', '1')
    setParams(next)
  }
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  const mutation = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      id
        ? api.patch<Category>(`/api/ticket-categories/${encodeURIComponent(id)}`, body)
        : api.post<Category>('/api/ticket-categories', body),
    onSuccess: async () => {
      setEditor(null)
      setNotice('分类信息已保存。')
      await refresh()
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : '保存失败。'),
  })
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="管理设置"
        title="工单分类"
        description="分类帮助团队组织工单，让问题更容易被归属和处理。"
        action={
          session?.user.role === 'admin' && (
            <button
              className="button button-primary"
              onClick={() => {
                setEditor('create')
                setNotice('')
              }}
              type="button"
            >
              ＋ 新建分类
            </button>
          )
        }
      />
      {notice && (
        <div className="inline-alert notice-alert" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setNotice('')}
            type="button"
          >
            ×
          </button>
        </div>
      )}
      {editor && (
        <section className="editor-section">
          <div className="section-heading">
            <h2>{editor === 'create' ? '创建分类' : `编辑分类：${editor.name}`}</h2>
          </div>
          <CategoryForm
            initial={editor === 'create' ? undefined : editor}
            pending={mutation.isPending}
            onCancel={() => setEditor(null)}
            onSave={(body) => {
              if (
                editor !== 'create' &&
                body.enabled === false &&
                editor.enabled &&
                !window.confirm('停用后该分类不能用于新工单，但历史工单仍会保留。确认停用？')
              )
                return
              mutation.mutate({ ...(editor === 'create' ? {} : { id: editor.id }), body })
            }}
          />
        </section>
      )}
      <section className="panel filter-panel">
        <div className="filter-grid">
          <label>
            关键词
            <input
              placeholder="搜索分类名称或描述"
              value={query.keyword || ''}
              onChange={(event) => setFilter('keyword', event.target.value)}
            />
          </label>
          <label>
            状态
            <select
              value={query.enabled || ''}
              onChange={(event) => setFilter('enabled', event.target.value)}
            >
              <option value="">全部状态</option>
              <option value="true">启用</option>
              <option value="false">已停用</option>
            </select>
          </label>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="table-heading">
          <div>
            <strong>分类列表</strong>
            <span className="muted">
              {categories.data?.meta ? `共 ${categories.data.meta.total} 个分类` : ''}
            </span>
          </div>
        </div>
        {categories.isPending ? (
          <Loading label="正在加载分类…" />
        ) : categories.isError ? (
          <ErrorState error={categories.error} retry={() => void categories.refetch()} />
        ) : categories.data.rows.length === 0 ? (
          <EmptyState title="没有匹配的分类" detail="调整筛选条件，或创建一个新分类。" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>描述</th>
                  <th>状态</th>
                  {session?.user.role === 'admin' && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {categories.data.rows.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <strong>{category.name}</strong>
                    </td>
                    <td className="description-cell">{category.description || '—'}</td>
                    <td>
                      <span className={`user-status ${category.enabled ? 'active' : 'disabled'}`}>
                        {category.enabled ? '启用' : '已停用'}
                      </span>
                    </td>
                    {session?.user.role === 'admin' && (
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditor(category)
                            setNotice('')
                          }}
                          type="button"
                        >
                          编辑
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {categories.data?.meta && categories.data.meta.totalPages > 1 && (
          <div className="pagination">
            <span>
              第 {categories.data.meta.page} / {categories.data.meta.totalPages} 页
            </span>
            <div>
              <button
                className="button button-secondary"
                disabled={page <= 1}
                onClick={() => setFilter('page', String(page - 1))}
                type="button"
              >
                上一页
              </button>
              <button
                className="button button-secondary"
                disabled={page >= categories.data.meta.totalPages}
                onClick={() => setFilter('page', String(page + 1))}
                type="button"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
