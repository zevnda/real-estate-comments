import { ChevronDownIcon } from './icons'

// A small always-visible dropdown for sorting and filtering a list (comments, search results)
export function ViewSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <label class='view-select' title={label}>
      <span class='visually-hidden'>{label}</span>
      <select value={value} onChange={event => onChange(event.currentTarget.value as T)}>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon />
    </label>
  )
}
