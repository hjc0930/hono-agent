import { formatDate, type Comment } from '../../apis/client.ts'
import { EmptyState } from '../common/EmptyState.tsx'
import { ErrorState } from '../common/ErrorState.tsx'
import { Loading } from '../common/Loading.tsx'

const commentListStyles = String.raw`
.comment-list { display:grid; gap:0; }.comment-item { display:flex; gap:11px; padding:15px 0; border-top:1px solid #eff2f0; }.comment-internal { margin:0 -10px; padding-right:10px; padding-left:10px; border-radius:8px; background:#fffbef; }.comment-avatar { display:grid; width:29px; height:29px; flex:none; place-items:center; border-radius:50%; background:#eaf4ef; color:#518169; font-size:10px; font-weight:750; }.comment-content { min-width:0; flex:1; }.comment-meta { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }.comment-meta strong { color:#39463e; font-size:11px; }.comment-meta time { margin-left:auto; color:#9aa49f; font-size:9px; }.comment-content p { margin:8px 0 0; color:#66736c; font-size:11px; line-height:1.75; white-space:pre-wrap; overflow-wrap:anywhere; }.internal-tag { padding:3px 6px; border-radius:4px; background:#f9edc9; color:#8e6b17; font-size:9px; font-weight:700; } @media (max-width:480px) { .comment-meta time { width:100%; margin-left:0; } }
`

export const TicketCommentList = ({
  comments,
  requesterId,
  userName,
  isPending,
  isError,
  error,
  retry,
}: {
  comments: Comment[]
  requesterId: string
  userName: (id: string) => string
  isPending: boolean
  isError: boolean
  error: unknown
  retry: () => void
}) => {
  if (isPending) return <Loading label="正在加载评论…" />
  if (isError) return <ErrorState error={error} retry={retry} />
  if (comments.length === 0)
    return <EmptyState title="还没有评论" detail="在下方添加第一条沟通记录。" />

  return (
    <div className="comment-list">
      <style>{commentListStyles}</style>
      {comments.map((comment) => (
        <article
          className={`comment-item ${comment.kind === 'internal' ? 'comment-internal' : ''}`}
          key={comment.id}
        >
          <div className="comment-avatar">{comment.authorId === requesterId ? '客' : '支'}</div>
          <div className="comment-content">
            <div className="comment-meta">
              <strong>{userName(comment.authorId)}</strong>
              {comment.kind === 'internal' && <span className="internal-tag">内部备注</span>}
              <time>{formatDate(comment.createdAt)}</time>
            </div>
            <p>{comment.body}</p>
          </div>
        </article>
      ))}
    </div>
  )
}
