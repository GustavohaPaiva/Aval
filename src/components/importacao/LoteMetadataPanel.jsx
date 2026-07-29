import { useState } from 'react'
import { IconSliders } from '../icons'
import { ESTADOS_PRODUTO } from '../../constants/mapeamentoCampos'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import {
  DEFAULT_TAXA_ANTECIPACAO,
  DEFAULT_TAXA_JUROS,
} from '../../utils/pricingCalculations'
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

function parseTaxaPercentual(value, fallback) {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback
  const num = parsePrecoValue(raw)
  if (num == null || !Number.isFinite(num) || num < 0) return fallback
  return num
}

function formatTaxaInput(value, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return String(fallback)
  return String(num)
}

export function LoteMetadataPanel({
  lote,
  readOnly,
  launched = false,
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
  const [taxaAntecipacao, setTaxaAntecipacao] = useState(() =>
    formatTaxaInput(lote?.taxa_antecipacao, DEFAULT_TAXA_ANTECIPACAO),
  )
  const [taxaJuros, setTaxaJuros] = useState(() =>
    formatTaxaInput(lote?.taxa_juros, DEFAULT_TAXA_JUROS),
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
      taxa_antecipacao: parseTaxaPercentual(
        taxaAntecipacao,
        DEFAULT_TAXA_ANTECIPACAO,
      ),
      taxa_juros: parseTaxaPercentual(taxaJuros, DEFAULT_TAXA_JUROS),
    })
  }

  function handleValidadeChange(value) {
    setDataValidade(value)
    // Only derive quarter from date when the field is still empty.
    // Multi-quarter sheets (Cibra Q3/Q4) keep the catalog quarter as source of truth.
    if (value && !String(quarter ?? '').trim()) {
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

  async function handleTaxasBlur() {
    await savePatch({
      taxa_antecipacao: parseTaxaPercentual(
        taxaAntecipacao,
        DEFAULT_TAXA_ANTECIPACAO,
      ),
      taxa_juros: parseTaxaPercentual(taxaJuros, DEFAULT_TAXA_JUROS),
    })
  }

  if (!lote) return null

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <div className="border-b border-slate-100 bg-gradient-to-r from-primary-50/70 via-white to-emerald-50/40 px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
              <IconSliders className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
                {launched ? 'Padrões da lista' : 'Metadados da planilha'}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {launched
                  ? 'Validade, quarter, desconto e taxas aplicados ao catálogo.'
                  : 'Defina quarter, validade e padrões antes de lançar.'}
              </p>
            </div>
          </div>
          {saving ? (
            <span className="text-xs font-medium text-slate-500">
              Salvando…
            </span>
          ) : null}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {launched && !readOnly ? (
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            Ao salvar, produtos do catálogo que ainda tiverem o valor antigo da
            lista serão atualizados. Produtos editados individualmente e
            simulações já criadas permanecem inalterados.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <Input
            label="Antecipação (% / 30 dias)"
            inputMode="decimal"
            value={taxaAntecipacao}
            onChange={(e) => setTaxaAntecipacao(e.target.value)}
            onBlur={() => void handleTaxasBlur()}
            disabled={readOnly}
            placeholder="Ex.: 1,7"
          />
          <Input
            label="Juros (% / 30 dias)"
            inputMode="decimal"
            value={taxaJuros}
            onChange={(e) => setTaxaJuros(e.target.value)}
            onBlur={() => void handleTaxasBlur()}
            disabled={readOnly}
            placeholder="Ex.: 2"
          />
        </div>
      </div>
    </section>
  )
}
