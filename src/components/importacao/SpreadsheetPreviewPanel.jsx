import { Input } from '../ui/Input'
import { dateToQuarter } from '../../utils/spreadsheetAnalyzer'

export function SpreadsheetPreviewPanel({
  dataValidade,
  onDataValidadeChange,
  quarterCalculado,
  onQuarterChange,
  previewRows = [],
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
    <section className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">
        Leitura da planilha
      </h2>

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

      {previewRows.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Prévia dos dados ({previewRows.length} linha
            {previewRows.length === 1 ? '' : 's'} filtrada
            {previewRows.length === 1 ? '' : 's'})
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
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
      ) : (
        <p className="text-xs text-amber-700">
          Nenhuma linha de dados identificada com o mapeamento atual.
        </p>
      )}
    </section>
  )
}
