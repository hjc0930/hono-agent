import { useState } from 'react'
import type { Role, User } from '../../apis/client.ts'

const roleText: Record<Role, string> = { admin: '管理员', agent: '处理人员', user: '普通用户' }

export const UserForm = ({
  initial,
  onCancel,
  onSave,
  pending,
}: {
  initial?: User
  onCancel: () => void
  onSave: (value: Record<string, unknown>) => void
  pending: boolean
}) => {
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState('')
  const [display, setDisplay] = useState(initial?.displayName ?? '')
  const [role, setRole] = useState<Role>(initial?.role ?? 'user')
  const [status, setStatus] = useState<User['status']>(initial?.status ?? 'active')
  const [error, setError] = useState('')
  return (
    <form
      className="panel form-panel form-stack"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        if (!initial && !/^[a-z0-9_-]{3,32}$/.test(username))
          return setError('用户名须为 3–32 位小写字母、数字、下划线或连字符。')
        if ((!initial || password) && (password.length < 8 || password.length > 128))
          return setError('密码长度须为 8–128 位。')
        onSave(
          initial
            ? { displayName: display || null, role, status }
            : { username, password, ...(display ? { displayName: display } : {}), role },
        )
      }}
    >
      {!initial && (
        <label>
          用户名
          <input
            autoComplete="off"
            maxLength={32}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
      )}
      {!initial && (
        <label>
          初始密码
          <input
            type="password"
            autoComplete="new-password"
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
      )}
      <label>
        显示名称
        <input
          maxLength={100}
          value={display}
          onChange={(event) => setDisplay(event.target.value)}
          placeholder="可选"
        />
      </label>
      <div className="form-row">
        <label>
          角色
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {Object.entries(roleText).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {initial && (
          <label>
            账户状态
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as User['status'])}
            >
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
        )}
      </div>
      {error && (
        <div className="inline-alert" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions">
        <button className="button button-secondary" onClick={onCancel} type="button">
          取消
        </button>
        <button className="button button-primary" disabled={pending} type="submit">
          {pending ? '保存中…' : initial ? '保存修改' : '创建用户'}
        </button>
      </div>
    </form>
  )
}
