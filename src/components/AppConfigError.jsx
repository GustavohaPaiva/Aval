export function AppConfigError({ message }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
          Aval
        </p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          Configuração necessária
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
        <p className="mt-4 text-sm text-slate-500">
          Após configurar os secrets, execute novamente o workflow{' '}
          <strong>Deploy GitHub Pages</strong> em Actions.
        </p>
      </div>
    </div>
  )
}
