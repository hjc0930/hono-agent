import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router'
import { useState } from 'react'
import {
  api,
  displayName,
  formatDate,
  type Category,
  type Comment,
  type Role,
  type Ticket,
  type TicketStatus,
  type User,
} from '../../services/client.ts'
import { useAuth } from '../../hooks/useAuth.tsx'
import {
  ErrorState,
  Loading,
  PageHeader,
  PriorityBadge,
  StatusBadge,
  TicketCommentList,
} from '../../components/index.tsx'

const roleText: Record<Role, string> = { admin: '管理员', agent: '处理人员', user: '普通用户' }

const statusOptions: Array<[TicketStatus, string]> = [
  ['pending', '待处理'],
  ['in_progress', '处理中'],
  ['resolved', '已解决'],
  ['closed', '已关闭'],
  ['cancelled', '已取消'],
]

const statusTargetText: Record<string, string> = Object.fromEntries(statusOptions)

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

const getUsers = async () => {
  const response = await api.get<User[]>('/api/users?page=1&pageSize=100&status=active')
  return response.data ?? []
}

const ticketDetailPageStyles = String.raw`
.back-link { display:inline-block; margin-bottom:20px; color:#687770; font-size:11px; font-weight:600; }.back-link:hover { color:var(--green-dark); }.detail-top { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:25px; }.detail-top .page-heading { margin:0; }.detail-top .page-heading h1 { max-width:790px; }.detail-badges { display:flex; flex:none; gap:7px; padding-bottom:5px; }.detail-grid { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(245px,.8fr); align-items:start; gap:19px; }.detail-main,.detail-side { display:grid; gap:18px; }.content-panel,.comments-panel,.side-panel { padding:22px; }.description-text { color:#536159; font-size:12px; line-height:1.85; white-space:pre-wrap; overflow-wrap:anywhere; }.count-pill { display:inline-grid; min-width:21px; height:21px; place-items:center; border-radius:50%; background:#f0f5f2; color:#77867e; font-size:10px; }.detail-meta { display:grid; gap:0; margin:0; }.detail-meta div { display:flex; justify-content:space-between; gap:12px; padding:11px 0; border-top:1px solid #f0f2f1; }.detail-meta dt { color:#86928b; font-size:10px; }.detail-meta dd { max-width:65%; margin:0; color:#49574f; font-size:10px; font-weight:600; text-align:right; overflow-wrap:anywhere; }.action-stack { display:grid; gap:8px; margin-bottom:17px; }.assign-form { display:grid; gap:11px; padding-top:16px; border-top:1px solid #edf0ee; }.assign-form .button { min-height:36px; }.comment-form { display:grid; gap:9px; margin-top:15px; padding-top:18px; border-top:1px solid #edf0ee; }.comment-form > label { font-size:12px; }.comment-form textarea { min-height:90px; }.comment-form-bottom { display:flex; align-items:center; justify-content:space-between; gap:10px; }.comment-actions { display:flex; align-items:center; gap:9px; }.comment-actions select { width:auto; min-width:115px; } @media (max-width:1050px) { .detail-grid { grid-template-columns:minmax(0,1.4fr) minmax(220px,.8fr); } } @media (max-width:760px) { .content-panel,.comments-panel,.side-panel { padding:17px; }.detail-grid { grid-template-columns:1fr; }.detail-side { grid-row:1; }.detail-top { display:block; }.detail-badges { margin-top:12px; } } @media (max-width:480px) { .detail-meta div { padding:9px 0; }.detail-top .page-heading { align-items:flex-start; }.comment-form-bottom { align-items:flex-start; flex-direction:column; }.comment-actions { width:100%; justify-content:flex-end; } }
`

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
      <style>{ticketDetailPageStyles}</style>
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
            <TicketCommentList
              comments={comments.data ?? []}
              requesterId={item.requesterId}
              userName={(id) => userName(id)}
              isPending={comments.isPending}
              isError={comments.isError}
              error={comments.error}
              retry={() => void comments.refetch()}
            />
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
