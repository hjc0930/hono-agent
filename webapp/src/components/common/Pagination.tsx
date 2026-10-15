import type { PageMeta } from '../../apis/client.ts'

const paginationStyles = String.raw`
.pagination { display:flex; align-items:center; justify-content:space-between; gap:15px; padding:15px 22px; border-top:1px solid #edf0ee; color:var(--muted); font-size:11px; }
.pagination > div { display:flex; gap:8px; }.pagination .button { min-height:33px; }
`

export const Pagination = ({
  meta,
  page,
  onPageChange,
}: {
  meta: PageMeta
  page: number
  onPageChange: (page: number) => void
}) => (
  <div className="pagination">
    <style>{paginationStyles}</style>
    <span>
      第 {meta.page} / {meta.totalPages} 页
    </span>
    <div>
      <button
        className="button button-secondary"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        上一页
      </button>
      <button
        className="button button-secondary"
        disabled={page >= meta.totalPages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        下一页
      </button>
    </div>
  </div>
)
