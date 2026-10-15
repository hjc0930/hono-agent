import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import {
  api,
  displayName,
  queryString,
  type Category,
  type PageMeta,
  type Priority,
  type Ticket,
  type TicketStatus,
  type User,
} from '../../apis/client.ts'
import { useAuth } from '../../hooks/useAuth.tsx'
import {
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Pagination,
  TicketTable,
} from '../../components/index.tsx'
import { DateInput } from '../../components/tickets/DateInput.tsx'

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

const getCategoryNames = async () => {
  const response = await api.get<Category[]>(
    '/api/ticket-categories?page=1&pageSize=100&enabled=true',
  )
  return response.data ?? []
}

const getAllUsers = async () => {
  const response = await api.get<User[]>('/api/users?page=1&pageSize=100')
  return response.data ?? []
}

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
          <TicketTable
            tickets={tickets.data.rows}
            categories={categories.data ?? []}
            users={users.data ?? []}
          />
        )}
        {tickets.data?.meta && tickets.data.meta.totalPages > 0 && (
          <Pagination
            meta={tickets.data.meta}
            page={page}
            onPageChange={(nextPage) => setFilter('page', String(nextPage))}
          />
        )}
      </section>
    </div>
  )
}
