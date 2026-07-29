import { Input } from '../ui/Input'
import { dateToQuarter } from '../../utils/spreadsheetAnalyzer'

function PreviewTable({ previewRows = [] }) {
  if (previewRows.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
        <p className="text-xs text-amber-800">
          Nenhuma linha de dados identificada com o mapeamento atual.
        </p>
      </div>
    )
  }

  const sample = previewRows.slice(0, 6)
  const colCount = Math.max(...sample.map((row) => row.length), 0)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Prévia dos dados
        </p>
        <p className="text-xs text-slate-500">
          {previewRows.length} linha
          {previewRows.length === 1 ? '' : 's'}
          {previewRows.length > 6 ? ' · mostrando 6' : ''}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/90">
              {Array.from({ length: colCount }, (_, ci) => (
                <th
                  key={ci}
                  className="whitespace-nowrap px-3 py-2 font-semibold uppercase tracking-wide text-slate-400"
                >
                  Col. {ci + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50/40"
              >
                {Array.from({ length: colCount }, (_, ci) => (
                  <td
                    key={ci}
                    className="max-w-[11rem] truncate px-3 py-2 text-slate-700"
                    title={String(row[ci] ?? '')}
                  >
                    {String(row[ci] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SingleQuarterFields({
  dataValidade,
  onDataValidadeChange,
  quarterCalculado,
  onQuarterChange,
}) {
  function handleValidadeChange(value) {
    onDataValidadeChange(value)
    if (value) {
      const d = new Date(`${value}T12:00:00`)
      if (!Number.isNaN(d.getTime())) {
        onQuarterChange(dateToQuarter(d))
      }
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input
        label="Data de validade"
        type="date"
        value={dataValidade ?? ''}
        onChange={(e) => handleValidadeChange(e.target.value)}
      />
      <Input
        label="Quarter calculado"
        value={quarterCalculado ?? ''}
        onChange={(e) => onQuarterChange(e.target.value)}
        placeholder="Ex.: Q2 2026"
      />
    </div>
  )
}

export function SpreadsheetPreviewPanel({
  dataValidade,
  onDataValidadeChange,
  quarterCalculado,
  onQuarterChange,
  previewRows = [],
  quarterGroups = [],
  activeGroupIndex = 0,
  onActiveGroupIndexChange,
  onGroupFieldChange,
}) {
  const multiQuarter = quarterGroups.length > 1
  const activeGroup = multiQuarter ? quarterGroups[activeGroupIndex] : null

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-sky-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
          Leitura da planilha
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {multiQuarter
            ? `Detectamos ${quarterGroups.length} quarters — cada um vira um lançamento separado.`
            : 'Revise validade, quarter e uma amostra dos produtos detectados.'}
        </p>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {multiQuarter ? (
          <>
            <div className="rounded-2xl border border-sky-200/80 bg-sky-50/50 px-4 py-3">
              <p className="text-sm font-semibold text-sky-900">
                {quarterGroups.length} lançamentos serão criados
              </p>
              <p className="mt-1 text-xs leading-relaxed text-sky-800/90">
                Selecione cada quarter abaixo para conferir validade e prévia
                dos produtos. Depois, processe todos de uma vez.
              </p>
            </div>

            <div>
              <p
                id="importacao-quarter-tabs-label"
                className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
              >
                Quarters detectados
              </p>
              <div
                role="tablist"
                aria-labelledby="importacao-quarter-tabs-label"
                className="flex flex-wrap gap-2"
              >
                {quarterGroups.map((group, index) => {
                  const selected = index === activeGroupIndex
                  return (
                    <button
                      key={group.quarter || index}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className={[
                        'inline-flex min-h-11 flex-col items-start justify-center rounded-2xl px-3.5 py-2 text-left transition-all sm:min-w-[8.5rem]',
                        selected
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80 hover:bg-white hover:text-slate-900',
                      ].join(' ')}
                      onClick={() => onActiveGroupIndexChange?.(index)}
                    >
                      <span className="text-sm font-semibold">
                        {group.quarter || `Grupo ${index + 1}`}
                      </span>
                      <span
                        className={[
                          'text-xs',
                          selected ? 'text-primary-100' : 'text-slate-500',
                        ].join(' ')}
                      >
                        {group.dataRows?.length ?? 0} produto
                        {(group.dataRows?.length ?? 0) === 1 ? '' : 's'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {activeGroup ? (
              <div
                className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4"
                role="tabpanel"
              >
                {activeGroup.catalogCode ? (
                  <p className="text-xs text-slate-500">
                    Catálogo: {activeGroup.catalogCode}
                  </p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Data de validade"
                    type="date"
                    value={activeGroup.dataValidade ?? ''}
                    onChange={(e) =>
                      onGroupFieldChange?.(activeGroupIndex, {
                        dataValidade: e.target.value,
                      })
                    }
                  />
                  <Input
                    label="Quarter"
                    value={activeGroup.quarter ?? ''}
                    onChange={(e) =>
                      onGroupFieldChange?.(activeGroupIndex, {
                        quarter: e.target.value,
                      })
                    }
                    placeholder="Ex.: Q3 2026"
                  />
                </div>
                <PreviewTable previewRows={activeGroup.dataRows ?? []} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <SingleQuarterFields
              dataValidade={dataValidade}
              onDataValidadeChange={onDataValidadeChange}
              quarterCalculado={quarterCalculado}
              onQuarterChange={onQuarterChange}
            />
            <PreviewTable previewRows={previewRows} />
          </>
        )}
      </div>
    </section>
  )
}
