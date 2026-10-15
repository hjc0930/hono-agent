export const DateInput = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) => (
  <label>
    {label}
    <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
  </label>
)
