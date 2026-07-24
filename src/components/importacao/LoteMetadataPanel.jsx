import { useState } from 'react'
import { ESTADOS_PRODUTO } from '../../constants/mapeamentoCampos'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { dateToQuarter, parsePrecoValue } from '../../utils/spreadsheetAnalyzer'

function formatValidade(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function parseDescontoUsd(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  return parsePrecoValue(raw) ?? 0
}

export function LoteMetadataPanel({
  lote,
  readOnly,
  onSave,
}) {
  const [dataValidade, setDataValidade] = useState(() =>
    formatValidade(lote?.data_validade),
  )
  const [quarter, setQuarter] = useState(() => lote?.quarter_calculado ?? '')
  const [descontoUsd, setDescontoUsd] = useState(() =>
    String(lote?.desconto_usd ?? 0),
  )
  const [estadoPadrao, setEstadoPadrao] = useState(
    () => lote?.estado_padrao ?? '',
  )
  const [saving, setSaving] = useState(false)

  async function savePatch(patch) {
    if (readOnly || !onSave) return
    setSaving(true)
    await onSave(patch)
    setSaving(false)
  }

  async function handleBlurSave() {
    await savePatch({
      data_validade: dataValidade || null,
      quarter_calculado: quarter,
      desconto_usd: parseDescontoUsd(descontoUsd),
      estado_padrao: estadoPadrao || null,
    })
  }

  function handleValidadeChange(value) {
    setDataValidade(value)
    if (value) {
      const d = new Date(`${value}T12:00:00`)
      if (!Number.isNaN(d.getTime())) {
        setQuarter(dateToQuarter(d))
      }
    }
  }

  async function handleEstadoChange(value) {
    setEstadoPadrao(value)
    await savePatch({ estado_padrao: value || null })
  }

  async function handleDescontoBlur() {
    await savePatch({
      desconto_usd: parseDescontoUsd(descontoUsd),
    })
  }

  if (!lote) return null

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          Metadados da planilha
        </h2>
        {saving ? (
          <span className="text-xs text-slate-500">Salvando…</span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Vencimento da lista"
          type="date"
          value={dataValidade}
          onChange={(e) => handleValidadeChange(e.target.value)}
          onBlur={() => void handleBlurSave()}
          disabled={readOnly}
        />
        <Input
          label="Quarter"
          value={quarter}
          onChange={(e) => setQuarter(e.target.value)}
          onBlur={() => void handleBlurSave()}
          disabled={readOnly}
          placeholder="Ex.: Q2 2026"
        />
        <Input
          label="Desconto USD (lista)"
          value={descontoUsd}
          onChange={(e) => setDescontoUsd(e.target.value)}
          onBlur={() => void handleDescontoBlur()}
          disabled={readOnly}
        />
        <Select
          label="Estado padrão"
          placeholder="Selecione…"
          value={estadoPadrao}
          onChange={(e) => void handleEstadoChange(e.target.value)}
          options={ESTADOS_PRODUTO}
          disabled={readOnly}
        />
      </div>
    </section>
  )
}
