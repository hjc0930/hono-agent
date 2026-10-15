import type { ReactNode } from 'react'

const pageHeaderStyles = String.raw`
.page-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:22px; margin-bottom:30px; }
.page-heading h1 { margin:7px 0 6px; font-size:clamp(28px,3vw,35px); font-weight:700; letter-spacing:-.055em; line-height:1.18; }
.page-heading p { margin:0; font-size:13px; line-height:1.6; }
.eyebrow { color:#688078; font-size:10px; font-weight:750; letter-spacing:.16em; text-transform:uppercase; }
@media (max-width:760px) { .page-heading { align-items:flex-start; margin-bottom:22px; }.page-heading h1 { font-size:27px; }.page-heading > .button { flex:none; } }
@media (max-width:480px) { .page-heading { flex-direction:column; }.page-heading > .button { align-self:flex-start; } }
`

export const PageHeader = ({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
}) => (
  <div className="page-heading">
    <style>{pageHeaderStyles}</style>
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
    </div>
    {action}
  </div>
)
