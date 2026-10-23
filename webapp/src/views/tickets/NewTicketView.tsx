import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { useState, type FormEvent } from 'react'
import {
  api,
  displayName,
  type Category,
  type Priority,
  type Ticket,
  type User,
} from '../../services/client.ts'
import { useAuth } from '../../hooks/useAuth.tsx'
import { FieldError, PageHeader } from '../../components/index.tsx'

const priorityOptions: Array<[Priority, string]> = [
  ['low', '低'],
  ['medium', '中'],
  ['high', '高'],
  ['urgent', '紧急'],
]

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
