import { Link } from 'react-router'
import { useAuth } from '../../hooks/useAuth.tsx'

const notFoundStyles = String.raw`
.not-found {
  display: grid;
  min-height: 100vh;
  align-content: center;
  justify-items: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
}
.not-found h1 {
  margin: 0;
  font-size: 29px;
  letter-spacing: -0.05em;
}
.not-found p {
  margin: 0 0 12px;
  font-size: 12px;
}

`

export const NotFound = () => {
  const { session } = useAuth()
  const home = session ? '/tickets' : '/login'
  return (
    <main className="not-found">
      <style>{notFoundStyles}</style>
      <div className="eyebrow">404 · 页面不存在</div>
      <h1>找不到这个页面</h1>
      <p className="muted">链接可能已失效，或者地址输入有误。</p>
      <Link className="button button-primary" to={home}>
        返回{session ? '工单' : '登录'}
      </Link>
    </main>
  )
}
