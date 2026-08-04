import { useCallback, useMemo, useState } from 'react'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { MobileCardList } from '../components/ui/MobileCardList'
import { PageHeader } from '../components/ui/PageHeader'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import {
  fetchParametrosSistema,
  updateParametrosSistema,
} from '../services/parametrosService'
import {
  criarCotacao,
  fetchCotacoesRecentes,
} from '../services/produtoImportacaoService'
import { DEFAULT_AUTONOMIA_PARAMS } from '../utils/autonomiaDesconto'
import { formatLoteDate } from '../utils/importacaoVisuals'
import { DEFAULT_ICMS_PERCENTUAL } from '../utils/pricingCalculations'

function parseDecimalBr(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
  if (!normalized) return null
  const num = Number.parseFloat(normalized)
  return Number.isFinite(num) ? num : NaN
}

function formatDecimalBr(value, { min = 2, max = 4 } = {}) {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })
}

export function ParametrosPage() {
  const [cotacoes, setCotacoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  const [dolar, setDolar] = useState('')
  const [dolarSaving, setDolarSaving] = useState(false)
  const [dolarError, setDolarError] = useState(null)

  const [icms, setIcms] = useState(String(DEFAULT_ICMS_PERCENTUAL))
  const [pisCofins, setPisCofins] = useState('')
  const [margem, setMargem] = useState('')
  const [autonomiaLimiar, setAutonomiaLimiar] = useState(
    String(DEFAULT_AUTONOMIA_PARAMS.autonomia_dias_limiar),
  )
  const [autonomiaEspLongo, setAutonomiaEspLongo] = useState(
    String(DEFAULT_AUTONOMIA_PARAMS.autonomia_especial_longo),
  )
  const [autonomiaConvLongo, setAutonomiaConvLongo] = useState(
    String(DEFAULT_AUTONOMIA_PARAMS.autonomia_convencional_longo),
  )
  const [autonomiaEspCurto, setAutonomiaEspCurto] = useState(
    String(DEFAULT_AUTONOMIA_PARAMS.autonomia_especial_curto),
  )
  const [autonomiaConvCurto, setAutonomiaConvCurto] = useState(
    String(DEFAULT_AUTONOMIA_PARAMS.autonomia_convencional_curto),
  )
  const [taxasSaving, setTaxasSaving] = useState(false)
  const [taxasError, setTaxasError] = useState(null)

  const dolarAtual = useMemo(() => {
    const usd = cotacoes.find((c) => c.moeda_origem?.toUpperCase() === 'USD')
    return usd ? Number(usd.taxa_conversao) : null
  }, [cotacoes])

  const cotacoesUsd = useMemo(
    () => cotacoes.filter((c) => c.moeda_origem?.toUpperCase() === 'USD'),
    [cotacoes],
  )

  const loadPage = useCallback(async (isActive) => {
    setLoading(true)
    setError(null)

    const [cotacoesRes, parametrosRes] = await Promise.all([
      fetchCotacoesRecentes(),
      fetchParametrosSistema(),
    ])

    if (isActive && !isActive()) return
    setLoading(false)

    if (!cotacoesRes.ok) {
      setError(cotacoesRes.error)
      return
    }
    if (!parametrosRes.ok) {
      setError(parametrosRes.error)
      return
    }

    setCotacoes(cotacoesRes.rows)
    const usd = cotacoesRes.rows.find(
      (c) => c.moeda_origem?.toUpperCase() === 'USD',
    )
    if (usd) {
      setDolar(formatDecimalBr(usd.taxa_conversao))
    }

    const row = parametrosRes.row
    setIcms(formatDecimalBr(row.icms_percentual ?? DEFAULT_ICMS_PERCENTUAL, {
      min: 0,
      max: 4,
    }))
    setPisCofins(
      row.pis_cofins_percentual == null
        ? ''
        : formatDecimalBr(row.pis_cofins_percentual, { min: 0, max: 4 }),
    )
    setMargem(
      row.margem_percentual == null
        ? ''
        : formatDecimalBr(row.margem_percentual, { min: 0, max: 4 }),
    )
    setAutonomiaLimiar(
      String(
        row.autonomia_dias_limiar ??
          DEFAULT_AUTONOMIA_PARAMS.autonomia_dias_limiar,
      ),
    )
    setAutonomiaEspLongo(
      formatDecimalBr(
        row.autonomia_especial_longo ??
          DEFAULT_AUTONOMIA_PARAMS.autonomia_especial_longo,
        { min: 0, max: 4 },
      ),
    )
    setAutonomiaConvLongo(
      formatDecimalBr(
        row.autonomia_convencional_longo ??
          DEFAULT_AUTONOMIA_PARAMS.autonomia_convencional_longo,
        { min: 0, max: 4 },
      ),
    )
    setAutonomiaEspCurto(
      formatDecimalBr(
        row.autonomia_especial_curto ??
          DEFAULT_AUTONOMIA_PARAMS.autonomia_especial_curto,
        { min: 0, max: 4 },
      ),
    )
    setAutonomiaConvCurto(
      formatDecimalBr(
        row.autonomia_convencional_curto ??
          DEFAULT_AUTONOMIA_PARAMS.autonomia_convencional_curto,
        { min: 0, max: 4 },
      ),
    )
  }, [])

  useSyncPageLoading(loading)

  useAbortableAsync(
    async (_signal, isActive) => {
      await loadPage(isActive)
    },
    [loadPage],
  )

  async function handleSubmitDolar(e) {
    e.preventDefault()
    setDolarError(null)
    setSuccessMessage(null)

    const valor = parseDecimalBr(dolar)
    if (!Number.isFinite(valor) || valor <= 0) {
      setDolarError('Informe um valor de dólar válido maior que zero.')
      return
    }

    setDolarSaving(true)
    const res = await criarCotacao({
      moeda_origem: 'USD',
      taxa_conversao: valor,
    })
    setDolarSaving(false)

    if (!res.ok) {
      setDolarError(res.error)
      return
    }

    setSuccessMessage(
      `Dólar atualizado para R$ ${formatDecimalBr(valor)}. Os preços internos dos produtos em USD foram recalculados automaticamente.`,
    )
    await loadPage(() => true)
  }

  async function handleSubmitTaxas(e) {
    e.preventDefault()
    setTaxasError(null)
    setSuccessMessage(null)

    const icmsNum = parseDecimalBr(icms)
    if (!Number.isFinite(icmsNum) || icmsNum < 0 || icmsNum >= 100) {
      setTaxasError('Informe um ICMS válido entre 0 e 100.')
      return
    }

    const pisRaw = String(pisCofins).trim()
    let pisNum = null
    if (pisRaw) {
      pisNum = parseDecimalBr(pisRaw)
      if (!Number.isFinite(pisNum) || pisNum < 0 || pisNum >= 100) {
        setTaxasError('Informe um PIS/COFINS válido entre 0 e 100.')
        return
      }
    }

    const margemRaw = String(margem).trim()
    let margemNum = null
    if (margemRaw) {
      margemNum = parseDecimalBr(margemRaw)
      if (!Number.isFinite(margemNum) || margemNum < 0) {
        setTaxasError('Informe uma margem válida maior ou igual a zero.')
        return
      }
    }

    const limiarNum = Number.parseInt(String(autonomiaLimiar).trim(), 10)
    if (!Number.isFinite(limiarNum) || limiarNum <= 0) {
      setTaxasError('Informe um limiar de dias válido maior que zero.')
      return
    }

    const espLongo = parseDecimalBr(autonomiaEspLongo)
    const convLongo = parseDecimalBr(autonomiaConvLongo)
    const espCurto = parseDecimalBr(autonomiaEspCurto)
    const convCurto = parseDecimalBr(autonomiaConvCurto)
    for (const [label, value] of [
      ['autonomia especiais (prazo longo)', espLongo],
      ['autonomia convencionais (prazo longo)', convLongo],
      ['autonomia especiais (prazo curto)', espCurto],
      ['autonomia convencionais (prazo curto)', convCurto],
    ]) {
      if (!Number.isFinite(value) || value < 0 || value >= 100) {
        setTaxasError(`Informe ${label} válido entre 0 e 100.`)
        return
      }
    }

    setTaxasSaving(true)
    const res = await updateParametrosSistema({
      icms_percentual: icmsNum,
      pis_cofins_percentual: pisNum,
      margem_percentual: margemNum,
      autonomia_dias_limiar: limiarNum,
      autonomia_especial_longo: espLongo,
      autonomia_convencional_longo: convLongo,
      autonomia_especial_curto: espCurto,
      autonomia_convencional_curto: convCurto,
    })
    setTaxasSaving(false)

    if (!res.ok) {
      setTaxasError(res.error)
      return
    }

    setSuccessMessage(
      'Parâmetros salvos. ICMS vale nos próximos lançamentos; margem e autonomia valem nas próximas simulações.',
    )
    await loadPage(() => true)
  }

  const columns = [
    {
      key: 'moeda',
      header: 'Moeda',
      cell: (row) => (
        <span className="font-mono font-semibold text-slate-900">
          {row.moeda_origem}
        </span>
      ),
    },
    {
      key: 'taxa',
      header: 'Taxa (→ BRL)',
      align: 'right',
      cell: (row) => Number(row.taxa_conversao).toLocaleString('pt-BR'),
    },
    {
      key: 'vigencia',
      header: 'Vigência',
      cell: (row) => formatLoteDate(row.data_vigencia),
    },
  ]

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow="Aval"
        title="Parâmetros"
        description="Dólar do dia e percentuais usados no sistema (ICMS no lançamento de produtos)."
      />

      {error ? <AlertMessage>{error}</AlertMessage> : null}
      {successMessage ? (
        <AlertMessage tone="success" role="status">
          {successMessage}
        </AlertMessage>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50/70 via-white to-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Dólar do dia (USD → BRL)
          </h2>
          {dolarAtual !== null ? (
            <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
              Atual: R${' '}
              {dolarAtual.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              })}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Atualize aqui o valor do dólar. Ao salvar, os preços internos de todos
          os produtos em USD são recalculados automaticamente. Apenas USD é
          aceito.
        </p>

        <form
          onSubmit={handleSubmitDolar}
          className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Input
              label="Valor do dólar (R$)"
              inputMode="decimal"
              placeholder="Ex.: 5,45"
              value={dolar}
              onChange={(e) => setDolar(e.target.value)}
              disabled={dolarSaving || loading}
              error={dolarError ?? undefined}
            />
          </div>
          <Button type="submit" loading={dolarSaving} className="shrink-0">
            Salvar dólar
          </Button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Percentuais do sistema
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          O ICMS é aplicado no custo dos produtos no lançamento (individual ou
          Excel). A Margem entra no preço de tabela da simulação. PIS/COFINS é
          apenas armazenado por enquanto.
        </p>

        <form
          onSubmit={handleSubmitTaxas}
          className="mt-4 grid gap-4 sm:grid-cols-3 sm:items-end"
        >
          <Input
            label="ICMS (%)"
            inputMode="decimal"
            placeholder="Ex.: 4"
            value={icms}
            onChange={(e) => setIcms(e.target.value)}
            disabled={taxasSaving || loading}
          />
          <Input
            label="PIS/COFINS (%)"
            inputMode="decimal"
            placeholder="Ex.: 9,25"
            value={pisCofins}
            onChange={(e) => setPisCofins(e.target.value)}
            disabled={taxasSaving || loading}
          />
          <Input
            label="Margem (%)"
            inputMode="decimal"
            placeholder="Ex.: 15"
            value={margem}
            onChange={(e) => setMargem(e.target.value)}
            disabled={taxasSaving || loading}
          />
          <div className="sm:col-span-3">
            <Button type="submit" loading={taxasSaving} className="w-full">
              Salvar percentuais
            </Button>
            {taxasError ? (
              <p
                className="mt-3 text-sm font-medium text-feedback-error"
                role="alert"
              >
                {taxasError}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          Autonomia de desconto
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Desconto máximo do consultor por prazo e classe. Prazo = data de
          pagamento − data da simulação. Com prazo ≥ limiar usa as faixas
          longas; abaixo, as curtas.
        </p>

        <form
          onSubmit={handleSubmitTaxas}
          className="mt-4 grid gap-4 sm:grid-cols-2 sm:items-end lg:grid-cols-3"
        >
          <Input
            label="Limiar (dias)"
            inputMode="numeric"
            placeholder="Ex.: 90"
            value={autonomiaLimiar}
            onChange={(e) => setAutonomiaLimiar(e.target.value)}
            disabled={taxasSaving || loading}
          />
          <Input
            label="Especiais ≥ limiar (%)"
            inputMode="decimal"
            placeholder="Ex.: 3"
            value={autonomiaEspLongo}
            onChange={(e) => setAutonomiaEspLongo(e.target.value)}
            disabled={taxasSaving || loading}
          />
          <Input
            label="Convencionais ≥ limiar (%)"
            inputMode="decimal"
            placeholder="Ex.: 4"
            value={autonomiaConvLongo}
            onChange={(e) => setAutonomiaConvLongo(e.target.value)}
            disabled={taxasSaving || loading}
          />
          <Input
            label="Especiais < limiar (%)"
            inputMode="decimal"
            placeholder="Ex.: 4,5"
            value={autonomiaEspCurto}
            onChange={(e) => setAutonomiaEspCurto(e.target.value)}
            disabled={taxasSaving || loading}
          />
          <div className="sm:col-span-2 lg:col-span-1">
            <Input
              label="Convencionais < limiar (%)"
              inputMode="decimal"
              placeholder="Ex.: 5,5"
              value={autonomiaConvCurto}
              onChange={(e) => setAutonomiaConvCurto(e.target.value)}
              disabled={taxasSaving || loading}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" loading={taxasSaving} className="w-full">
              Salvar autonomia
            </Button>
            {taxasError ? (
              <p
                className="mt-3 text-sm font-medium text-feedback-error"
                role="alert"
              >
                {taxasError}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
        <div className="border-b border-slate-100 px-4 py-3.5 sm:px-6 sm:py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
            Histórico do dólar (USD)
          </p>
        </div>
        <div className="p-4 sm:p-6">
          {loading ? (
            <EmptyState title="Carregando cotações…" />
          ) : cotacoesUsd.length === 0 ? (
            <EmptyState
              title="Nenhuma cotação de dólar cadastrada"
              description="Informe o valor do dólar acima."
            />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={cotacoesUsd}
                getRowKey={(row) => row.id}
              />
              <MobileCardList
                items={cotacoesUsd}
                emptyMessage="Nenhuma cotação de dólar cadastrada"
                renderItem={(row) => (
                  <li
                    key={row.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {row.moeda_origem}
                      </span>
                      <span className="finance-text text-sm font-semibold text-slate-900">
                        {Number(row.taxa_conversao).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Vigência {formatLoteDate(row.data_vigencia)}
                    </p>
                  </li>
                )}
              />
            </>
          )}
        </div>
      </section>
    </div>
  )
}
