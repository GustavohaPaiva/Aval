import { useCallback, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'lg',
  sheet = false,
}) {
  const titleId = useId()
  const panelRef = useRef(null)

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, handleKeyDown])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector('input,button,select')?.focus()
    }, 0)
    return () => window.clearTimeout(t)
  }, [open])

  if (!open) return null

  const widthClass =
    size === 'sm'
      ? 'sm:max-w-sm'
      : size === 'md'
        ? 'sm:max-w-xl'
        : size === 'xl'
          ? 'sm:max-w-4xl'
          : size === '2xl'
            ? 'sm:max-w-6xl'
            : 'sm:max-w-2xl'

  return createPortal(
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
        aria-hidden
      />
      <div
        className="absolute inset-0 overflow-y-auto overscroll-contain"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div
          className={[
            'flex min-h-full w-full justify-center',
            sheet
              ? 'items-end p-0 sm:items-center sm:p-4 sm:py-8'
              : 'items-center p-4 py-8',
          ].join(' ')}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={[
              'flex w-full flex-col overflow-hidden border border-slate-200/90 bg-white shadow-[0_20px_50px_-15px_rgba(15,23,42,0.15)]',
              sheet
                ? 'max-h-[94vh] rounded-t-3xl rounded-b-none sm:max-h-[min(90vh,calc(100vh-4rem))] sm:rounded-3xl'
                : 'max-h-[min(90vh,calc(100vh-4rem))] rounded-3xl',
              widthClass,
            ].join(' ')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <h2
                id={titleId}
                className="text-base font-semibold tracking-tight text-slate-900"
              >
                {title}
              </h2>
              <button
                type="button"
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Fechar"
                onClick={onClose}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {children}
            </div>
            {footer ? (
              <div
                className={[
                  'shrink-0 border-t border-slate-100 px-5 py-4',
                  sheet
                    ? 'pb-[max(1rem,env(safe-area-inset-bottom))]'
                    : '',
                ].join(' ')}
              >
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
