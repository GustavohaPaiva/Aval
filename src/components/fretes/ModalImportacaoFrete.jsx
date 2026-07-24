import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { importFretesFromRows } from '../../services/freteService'
import { parseFreteSpreadsheetFile } from '../../utils/freteSpreadsheet'
import { formatBRL } from '../../utils/money'
import { IconFileSpreadsheet, IconUpload } from '../icons'
import { AlertMessage } from '../ui/AlertMessage'
import { Button } from '../ui/Button'
import { ButtonGroup } from '../ui/ButtonGroup'
import { Modal } from '../ui/Modal'

const ACCEPTED_MIME = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
}

function isAcceptedSpreadsheet(file) {
  const name = file.name.toLowerCase()
  return name.endsWith('.xlsx') || name.endsWith('.csv') || name.endsWith('.xls')
}

const STEPS = {
  upload: 'upload',
  preview: 'preview',
  importing: 'importing',
  summary: 'summary',
}

function SummaryStat({ label, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-slate-50 text-slate-900 ring-slate-200/80',
    emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-200/80',
    sky: 'bg-sky-50 text-sky-900 ring-sky-200/80',
    amber: 'bg-amber-50 text-amber-900 ring-amber-200/80',
    red: 'bg-red-50 text-red-900 ring-red-200/80',
  }[tone]

  return (
    <div
      className={[
        'rounded-2xl px-4 py-3 ring-1 ring-inset',
        toneClass,
      ].join(' ')}
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] opacity-70">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export function ModalImportacaoFrete({ open, onClose, onImported }) {
  const [step, setStep] = useState(STEPS.upload)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [summary, setSummary] = useState(null)
  const [parsing, setParsing] = useState(false)

  function resetState() {
    setStep(STEPS.upload)
    setError(null)
    setFileName('')
    setAnalysis(null)
    setProgress({ done: 0, total: 0 })
    setSummary(null)
    setParsing(false)
  }

  useAbortableAsync(
    async (_signal, isActive) => {
      if (!isActive()) return
      if (open) resetState()
    },
    [open],
    open,
  )

  function handleClose() {
    if (step === STEPS.importing) return
    resetState()
    onClose()
  }

  const handleFile = useCallback(async (file) => {
    if (!file || !isAcceptedSpreadsheet(file)) {
      setError('Formato inválido. Use .xlsx ou .csv.')
      return
    }

    setParsing(true)
    setError(null)
    setFileName(file.name)

    try {
      const result = await parseFreteSpreadsheetFile(file)
      if (!result.ok) {
        setError(result.error)
        setAnalysis(null)
        setStep(STEPS.upload)
        return
      }

      setAnalysis(result)
      setStep(STEPS.preview)
    } catch (err) {
      setError(err?.message || 'Não foi possível ler a planilha.')
      setAnalysis(null)
      setStep(STEPS.upload)
    } finally {
      setParsing(false)
    }
  }, [])

  const onDrop = useCallback(
    (acceptedFiles, rejectedFiles) => {
      if (rejectedFiles.length > 0) {
        setError('Envie apenas planilhas .xlsx ou .csv.')
        return
      }
      const file = acceptedFiles[0]
      if (!file) return
      void handleFile(file)
    },
    [handleFile],
  )

  const { getRootProps, getInputProps, isDragActive, isDragAccept } =
    useDropzone({
      onDrop,
      accept: ACCEPTED_MIME,
      maxFiles: 1,
      multiple: false,
      disabled: !open || parsing || step === STEPS.importing,
    })

  async function handleImport() {
    if (!analysis?.validRows?.length) return

    setStep(STEPS.importing)
    setError(null)
    setProgress({ done: 0, total: analysis.validRows.length })

    const result = await importFretesFromRows(analysis.validRows, {
      onProgress: (done, total) => setProgress({ done, total }),
    })

    if (!result.ok) {
      setError(result.error)
      setStep(STEPS.preview)
      return
    }

    const parseFailures = (analysis.invalidRows ?? []).map((row) => ({
      rowNumber: row.rowNumber,
      origem: row.origemRaw,
      destino: row.destinoRaw,
      error: row.error,
    }))

    setSummary({
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged ?? 0,
      failed: result.failed + parseFailures.length,
      failures: [...parseFailures, ...(result.failures ?? [])],
    })
    setStep(STEPS.summary)
    onImported?.(result)
  }

  const dropzoneClass = [
    'flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-all',
    isDragAccept || isDragActive
      ? 'border-primary-400 bg-primary-50/70 shadow-inner'
      : 'border-slate-200 bg-slate-50/60 hover:border-primary-300 hover:bg-primary-50/40',
    parsing ? 'pointer-events-none opacity-60' : '',
  ].join(' ')

  const previewRows = analysis?.validRows?.slice(0, 8) ?? []
  const progressPct =
    progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0

  const footer =
    step === STEPS.preview ? (
      <ButtonGroup>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setAnalysis(null)
            setFileName('')
            setError(null)
            setStep(STEPS.upload)
          }}
        >
          Trocar arquivo
        </Button>
        <Button
          type="button"
          disabled={!analysis?.validRows?.length}
          onClick={() => void handleImport()}
        >
          Importar {analysis?.validRows?.length ?? 0} frete(s)
        </Button>
      </ButtonGroup>
    ) : step === STEPS.summary ? (
      <ButtonGroup>
        <Button type="button" onClick={handleClose}>
          Concluir
        </Button>
      </ButtonGroup>
    ) : step === STEPS.upload ? (
      <ButtonGroup>
        <Button type="button" variant="secondary" onClick={handleClose}>
          Cancelar
        </Button>
      </ButtonGroup>
    ) : null

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Importar fretes"
      size="xl"
      footer={footer}
    >
      <div className="space-y-4">
        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {step === STEPS.upload ? (
          <>
            <p className="text-sm text-slate-600">
              Envie uma planilha com as colunas{' '}
              <span className="font-medium text-slate-800">origem</span>,{' '}
              <span className="font-medium text-slate-800">destino</span> e{' '}
              <span className="font-medium text-slate-800">valor</span>. Rotas
              existentes terão apenas o valor atualizado.
            </p>

            <div {...getRootProps({ className: dropzoneClass })}>
              <input {...getInputProps()} />
              <div
                className={[
                  'flex size-12 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset',
                  isDragActive
                    ? 'bg-primary-100 text-primary-700 ring-primary-200/80'
                    : 'bg-white text-slate-500 ring-slate-200/80',
                ].join(' ')}
              >
                {isDragActive ? (
                  <IconFileSpreadsheet className="size-6" aria-hidden />
                ) : (
                  <IconUpload className="size-6" aria-hidden />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {parsing
                    ? 'Lendo planilha…'
                    : isDragActive
                      ? 'Solte a planilha aqui'
                      : 'Arraste e solte sua planilha'}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  ou clique para selecionar · .xlsx, .csv
                </p>
              </div>
            </div>
          </>
        ) : null}

        {step === STEPS.preview && analysis ? (
          <>
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 px-4 py-3">
              <p className="text-sm font-medium text-slate-900">{fileName}</p>
              <p className="mt-1 text-xs text-slate-600">
                {analysis.validRows.length} linha(s) válida(s)
                {analysis.invalidRows.length > 0
                  ? ` · ${analysis.invalidRows.length} com erro (serão ignoradas na gravação)`
                  : ''}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <SummaryStat
                label="Válidas"
                value={analysis.validRows.length}
                tone="emerald"
              />
              <SummaryStat
                label="Com erro"
                value={analysis.invalidRows.length}
                tone={analysis.invalidRows.length ? 'red' : 'slate'}
              />
              <SummaryStat
                label="Total lido"
                value={analysis.totalRows}
                tone="sky"
              />
            </div>

            {previewRows.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200/90">
                <div className="border-b border-slate-100 bg-white px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Prévia das linhas válidas
                  </p>
                </div>
                <div className="max-h-56 overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Linha</th>
                        <th className="px-3 py-2 font-semibold">Origem</th>
                        <th className="px-3 py-2 font-semibold">Destino</th>
                        <th className="px-3 py-2 font-semibold">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {previewRows.map((row) => (
                        <tr key={`${row.rowNumber}-${row.origem}-${row.destino}`}>
                          <td className="px-3 py-2 tabular-nums text-slate-500">
                            {row.rowNumber}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {row.origem}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {row.destino}
                          </td>
                          <td className="finance-text px-3 py-2 text-slate-800">
                            {formatBRL(row.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {analysis.validRows.length > previewRows.length ? (
                  <p className="border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-xs text-slate-500">
                    Mostrando {previewRows.length} de{' '}
                    {analysis.validRows.length} linhas válidas.
                  </p>
                ) : null}
              </div>
            ) : (
              <AlertMessage tone="info">
                Nenhuma linha válida para importar. Corrija a planilha e tente
                novamente.
              </AlertMessage>
            )}

            {analysis.invalidRows.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-red-200/80">
                <div className="border-b border-red-100 bg-red-50/70 px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
                    Linhas com erro
                  </p>
                </div>
                <ul className="max-h-40 space-y-2 overflow-auto bg-white px-4 py-3 text-sm">
                  {analysis.invalidRows.slice(0, 20).map((row) => (
                    <li key={`${row.rowNumber}-${row.error}`} className="text-red-800">
                      <span className="font-medium">Linha {row.rowNumber}:</span>{' '}
                      {row.error}
                    </li>
                  ))}
                </ul>
                {analysis.invalidRows.length > 20 ? (
                  <p className="border-t border-red-100 bg-red-50/50 px-4 py-2 text-xs text-red-700">
                    +{analysis.invalidRows.length - 20} erro(s) adicional(is).
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {step === STEPS.importing ? (
          <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 px-4 py-5">
            <p className="text-sm font-medium text-slate-900">
              Importando fretes…
            </p>
            <p className="text-xs text-slate-600">
              {progress.done} de {progress.total} linha(s)
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-primary-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : null}

        {step === STEPS.summary && summary ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat
                label="Criados"
                value={summary.created}
                tone="emerald"
              />
              <SummaryStat
                label="Atualizados"
                value={summary.updated}
                tone="sky"
              />
              <SummaryStat
                label="Sem alteração"
                value={summary.unchanged}
                tone="amber"
              />
              <SummaryStat
                label="Falhas"
                value={summary.failed}
                tone={summary.failed ? 'red' : 'slate'}
              />
            </div>

            {summary.failed === 0 ? (
              <AlertMessage tone="success" role="status">
                Importação concluída com sucesso.
              </AlertMessage>
            ) : (
              <AlertMessage tone="info" role="status">
                Importação concluída com {summary.failed} falha(s). As demais
                linhas válidas foram processadas.
              </AlertMessage>
            )}

            {summary.failures.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-red-200/80">
                <div className="border-b border-red-100 bg-red-50/70 px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
                    Detalhes das falhas
                  </p>
                </div>
                <ul className="max-h-48 space-y-2 overflow-auto bg-white px-4 py-3 text-sm">
                  {summary.failures.map((item, index) => (
                    <li
                      key={`${item.rowNumber ?? 'x'}-${index}-${item.error}`}
                      className="text-red-800"
                    >
                      {item.rowNumber != null ? (
                        <span className="font-medium">
                          Linha {item.rowNumber}:{' '}
                        </span>
                      ) : null}
                      {item.origem && item.destino
                        ? `${item.origem} → ${item.destino} — `
                        : null}
                      {item.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  )
}
