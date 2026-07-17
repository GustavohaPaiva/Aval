import { useState } from 'react'
import { Select } from './Select'

export function EditableSelect({
  value,
  onChange,
  options = [],
  disabled = false,
  placeholder = 'Selecione…',
  className = '',
  ariaLabel,
}) {
  const [editing, setEditing] = useState(false)

  const selectedOption = options.find((o) => o.value === value)
  const display = selectedOption?.label ?? value ?? '—'

  function commit(nextValue) {
    setEditing(false)
    if (nextValue !== value) onChange(nextValue)
  }

  if (disabled) {
    return (
      <span className={['text-sm text-slate-800', className].filter(Boolean).join(' ')}>
        {display}
      </span>
    )
  }

  if (editing) {
    return (
      <Select
        aria-label={ariaLabel}
        size="compact"
        autoOpen
        value={value ?? ''}
        placeholder={placeholder}
        options={options}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        className={className}
        data-no-row-click
      />
    )
  }

  return (
    <button
      type="button"
      data-no-row-click
      aria-label={
        ariaLabel ? `${ariaLabel}: ${display}. Clique para editar.` : undefined
      }
      className={[
        'cursor-pointer rounded-lg px-1 text-sm text-slate-800 underline decoration-dotted decoration-slate-300 underline-offset-4 transition-colors hover:text-primary-800 hover:decoration-primary-400',
        !value ? 'text-amber-700' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => setEditing(true)}
    >
      {value ? display : 'Pendente'}
    </button>
  )
}
