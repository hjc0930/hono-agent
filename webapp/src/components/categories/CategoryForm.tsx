import { useState } from 'react'
import type { Category } from '../../services/client.ts'

export const CategoryForm = ({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial?: Category
  pending: boolean
  onCancel: () => void
  onSave: (body: Record<string, unknown>) => void
}) => {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [error, setError] = useState('')
  return (
    <form
      className="panel form-panel form-stack"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        if (!name.trim() || name.trim().length > 64)
          return setError('名称为必填项，最多 64 个字符。')
        if (description.length > 255) return setError('描述最多 255 个字符。')
        onSave(
          initial
            ? { name: name.trim(), description: description.trim() || null, enabled }
            : {
                name: name.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
              },
        )
      }}
    >
      <label>
        分类名称 <span className="required">*</span>
        <input
          value={name}
          maxLength={64}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label>
        描述
        <textarea
          rows={3}
          value={description}
          maxLength={255}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {initial && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          启用分类
        </label>
      )}
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
          {pending ? '保存中…' : initial ? '保存修改' : '创建分类'}
        </button>
      </div>
    </form>
  )
}
