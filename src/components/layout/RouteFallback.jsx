import { BrandMark } from '../brand/BrandLogo'

export function RouteFallback() {
  return (
    <div
      className="flex min-h-[12rem] flex-col items-center justify-center gap-3 py-8"
      role="status"
      aria-live="polite"
      aria-label="Carregando página"
    >
      <span className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-slate-950 ring-1 ring-slate-800">
        <BrandMark className="size-7" />
      </span>
      <span
        className="size-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600"
        aria-hidden
      />
    </div>
  )
}
