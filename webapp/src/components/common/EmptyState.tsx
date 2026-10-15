const emptyStateStyles = String.raw`
.empty-state { display:grid; min-height:210px; align-content:center; justify-items:center; gap:9px; padding:25px; color:#99a49e; font-size:11px; text-align:center; }.empty-state strong { color:#46534d; font-size:13px; }.empty-mark { display:grid; width:38px; height:38px; place-items:center; margin-bottom:4px; border-radius:50%; background:#f2f7f4; color:#679781; font-size:19px; }
`

export const EmptyState = ({ title, detail }: { title: string; detail?: string }) => (
  <div className="empty-state">
    <style>{emptyStateStyles}</style>
    <span className="empty-mark">✳</span>
    <strong>{title}</strong>
    {detail && <span>{detail}</span>}
  </div>
)
