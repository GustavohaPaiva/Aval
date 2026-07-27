import { Input } from '../ui/Input'
import { dateToQuarter } from '../../utils/spreadsheetAnalyzer'

function PreviewTable({ previewRows = [] }) {
  if (previewRows.length === 0) {
    return (
      <p className="text-xs text-amber-700">
        Nenhuma linha de dados identificada com o mapeamento atual.
      </p>
    )
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Prévia dos dados ({previewRows.length} linha
        {previewRows.length === 1 ? '' : 's'} filtrada
        {previewRows.length === 1 ? '' : 's'})
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <tbody>
            {previewRows.slice(0, 5).map((row, ri) => (
              <tr key={ri} className="border-b border-slate-100 last:border-0">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="max-w-[10rem] truncate px-3 py-2 text-slate-700"
                  >
                    {String(cell ?? '')}
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
    <section className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          Leitura da planilha
        </h2>
        {multiQuarter ? (
          <p className="mt-1 text-xs text-slate-600">
            Esta planilha contém {quarterGroups.length} quarters. Cada um será
            processado como um lançamento separado.
          </p>
        ) : null}
      </div>

      {multiQuarter ? (
        <>
          <div>
            <p
              id="importacao-quarter-tabs-label"
              className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
            >
              Lançamentos detectados
            </p>
            <div
              role="tablist"
              aria-labelledby="importacao-quarter-tabs-label"
              className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70"
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
                      'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-center text-sm font-medium transition-all',
                      selected
                        ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200/80'
                        : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
                    ].join(' ')}
                    onClick={() => onActiveGroupIndexChange?.(index)}
                  >
                    <span>{group.quarter}</span>
                    <span
                      className={
                        selected ? 'text-primary-600/80' : 'text-slate-400'
                      }
                    >
                      · {group.dataRows?.length ?? 0}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {activeGroup ? (
            <div className="space-y-4" role="tabpanel">
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
    </section>
  )
}
