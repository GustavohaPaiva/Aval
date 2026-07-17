import { IconTrash } from '../icons'
import { Button } from '../ui/Button'

export function RemoveLineButton({ onClick, disabled, className = '' }) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label="Remover linha"
      className={[
        'h-9 w-9 shrink-0 p-0 text-red-600 hover:bg-red-50 hover:text-red-700',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      disabled={disabled}
    >
      <IconTrash className="size-4" />
    </Button>
  )
}
