import type { ReactNode } from 'react'

const fieldErrorStyles = String.raw`.field-error { color:#a54f45; font-size:10px; font-weight:500; }`

export const FieldError = ({ children }: { children?: ReactNode }) =>
  children ? (
    <span className="field-error" role="alert">
      <style>{fieldErrorStyles}</style>
      {children}
    </span>
  ) : null
