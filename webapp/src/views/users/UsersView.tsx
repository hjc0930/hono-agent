import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { useState } from 'react'
import {
  api,
  displayName,
  queryString,
  type PageMeta,
  type Role,
  type User,
} from '../../services/client.ts'
import { EmptyState, ErrorState, Loading, PageHeader, Pagination } from '../../components/index.tsx'
import { UserForm } from '../../components/users/UserForm.tsx'

const roleText: Record<Role, string> = { admin: '管理员', agent: '处理人员', user: '普通用户' }

const usersPageStyles = String.raw`
.user-cell { display:flex; align-items:center; gap:10px; }.user-cell > span:last-child { display:grid; gap:4px; }.user-cell strong { color:#35413a; font-size:11px; }.user-cell small { color:#9aa59f; font-size:10px; }.small-avatar { width:30px; height:30px; font-size:11px; }.user-status { display:inline-flex; align-items:center; gap:6px; color:#728078; font-size:10px; }.user-status::before { width:6px; height:6px; border-radius:50%; background:#a8b1ac; content:''; }.user-status.active::before { background:#3e9a6a; }.user-status.disabled::before { background:#bd6e61; }.row-actions { display:flex; gap:15px; }
`

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
      <style>{usersPageStyles}</style>
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
          <Pagination
            meta={users.data.meta}
            page={page}
            onPageChange={(nextPage) => setFilter('page', String(nextPage))}
          />
        )}
      </section>
    </div>
  )
}
