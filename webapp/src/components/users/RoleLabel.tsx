import type { Role } from '../../services/client.ts'

const roleLabels: Record<Role, string> = { admin: '管理员', agent: '处理人员', user: '普通用户' }

export const RoleLabel = ({ role }: { role: Role }) => (
  <span className={`role-pill role-${role}`}>{roleLabels[role]}</span>
)
