const errorStateStyles = String.raw`.error-state { flex-wrap:wrap; color:#a54d44; }`

export const ErrorState = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <div className="state-card error-state" role="alert">
    <style>{errorStateStyles}</style>
    <span>{error instanceof Error ? error.message : '加载失败，请稍后重试。'}</span>
    {retry && (
      <button className="button button-secondary" onClick={retry} type="button">
        重试
      </button>
    )}
  </div>
)
