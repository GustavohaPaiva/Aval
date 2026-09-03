export function InfoStatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  valueClassName = "finance-text truncate text-lg font-semibold leading-tight tracking-tight text-slate-900 sm:text-xl",
  className = "p-3.5 sm:p-4",
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl",
        className,
      ].join(" ")}
    >
      <div
        className="pointer-events-none absolute -right-4 -top-4 size-20 rounded-full bg-gradient-to-br from-primary-100/40 to-transparent blur-2xl"
        aria-hidden
      />
      <div className="relative flex items-center gap-2.5 sm:gap-3">
        <span
          className={[
            "flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10 sm:rounded-2xl",
            accent,
          ].join(" ")}
        >
          <Icon className="size-3.5 sm:size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
          <p className="text-[0.65rem] font-semibold uppercase leading-tight tracking-[0.14em] text-slate-500">
            {label}
          </p>
          <p className={valueClassName}>{value}</p>
          <p className="truncate text-xs leading-tight text-slate-500">{hint}</p>
        </div>
      </div>
    </div>
  );
}

export function PageInfoBanner({ icon: Icon, children, iconClassName }) {
  return (
    <div className="relative mt-4 flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-left backdrop-blur-sm sm:mt-5 sm:rounded-2xl sm:px-4 sm:py-3">
      <span
        className={[
          "flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm sm:size-9 sm:rounded-xl",
          iconClassName || "bg-primary-600",
        ].join(" ")}
      >
        <Icon className="size-3.5 sm:size-4" />
      </span>
      <div className="min-w-0 flex-1 text-left text-sm leading-relaxed text-slate-700">
        {children}
      </div>
    </div>
  );
}
