import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { useState } from 'react'
import { api, queryString, type Category, type PageMeta } from '../../apis/client.ts'
import { useAuth } from '../../hooks/useAuth.tsx'
import { EmptyState, ErrorState, Loading, PageHeader, Pagination } from '../../components/index.tsx'
import { CategoryForm } from '../../components/categories/CategoryForm.tsx'

const categoriesPageStyles = String.raw`.description-cell { max-width:400px; overflow:hidden; text-overflow:ellipsis; }`

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
      <style>{categoriesPageStyles}</style>
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
          <Pagination
            meta={categories.data.meta}
            page={page}
            onPageChange={(nextPage) => setFilter('page', String(nextPage))}
          />
        )}
      </section>
    </div>
  )
}
