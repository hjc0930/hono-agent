const loadingStyles = String.raw`
.state-card { display:flex; min-height:120px; align-items:center; justify-content:center; gap:11px; padding:24px; color:var(--muted); font-size:12px; }.spinner { width:17px; height:17px; border:2px solid #dce8e2; border-top-color:var(--green); border-radius:50%; animation:spin .7s linear infinite; } @keyframes spin { to { transform:rotate(360deg); } }
`

export const Loading = ({ label = '正在加载…' }: { label?: string }) => (
  <div className="state-card" role="status">
    <style>{loadingStyles}</style>
    <span className="spinner" />
    {label}
  </div>
)
