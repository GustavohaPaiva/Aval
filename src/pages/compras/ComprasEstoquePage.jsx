import { useMemo, useState } from 'react'
import { ComprasSubnav } from '../../components/compras/ComprasSubnav'
import { IconWarehouse } from '../../components/icons'
import { AlertMessage } from '../../components/ui/AlertMessage'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { ModalFormFooter } from '../../components/ui/ModalFormFooter'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageInfoBanner } from '../../components/ui/InfoStatCard'
import { SearchInput } from '../../components/ui/SearchInput'
import { Select } from '../../components/ui/Select'
import {
  COMPRAS_EMBALAGEM_DEFAULT,
  COMPRAS_LOCAL_ESTOQUE,
  EMBALAGEM_OPTIONS,
  UNIDADE_OPTIONS,
} from '../../constants/compras'
import { formatBRL } from '../../utils/money'
import { useSyncPageLoading } from '../../contexts/PageLoadingContext'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import {
  ajusteEntrada,
  ajusteSaida,
  fetchEstoqueLotes,
  fetchFornecedoresAtivos,
  fetchProdutosPorFornecedor,
} from '../../services/comprasService'
import { formatQtyBoth, formatUsd, parseQtyInput } from '../../utils/comprasUnits'

export function ComprasEstoquePage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [ajuste, setAjuste] = useState(null)
  const debounced = useDebouncedValue(search, 250)

  useSyncPageLoading(loading)

  useAbortableAsync(
    async (_s, isActive) => {
      setLoading(true)
      setError(null)
      const res = await fetchEstoqueLotes()
      if (!isActive()) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setRows([])
        return
      }
      setRows(res.rows)
    },
    [reloadKey],
  )

  const filtered = useMemo(() => {
    const q = debounced.trim().toLocaleLowerCase('pt-BR')
    if (!q) return rows
    return rows.filter((row) =>
      [row.product?.displayNome, row.product?.fornecedor_nome, row.embalagem, row.ocNumero]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(q),
    )
  }, [rows, debounced])

  const totalDisp = filtered.reduce((acc, r) => acc + r.disponivelKg, 0)

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6">
        <PageHeader
          eyebrow="Compras"
          title="Estoque"
          description={`${COMPRAS_LOCAL_ESTOQUE}. Cada lote guarda o custo da entrada e não se mistura.`}
          actions={
            <Button type="button" onClick={() => setAjuste('entrada')} className="w-full">
              Lançamento individual
            </Button>
          }
          className="relative mb-0"
        />
        <PageInfoBanner icon={IconWarehouse}>
          {loading
            ? 'Carregando estoque…'
            : `Disponível no filtro: ${formatQtyBoth(totalDisp)}.`}
        </PageInfoBanner>
      </div>

      <ComprasSubnav />
      {error ? <AlertMessage>{error}</AlertMessage> : null}

      <SearchInput
        placeholder="Produto, fornecedor ou OC…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <EmptyState title="Carregando lotes…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhum lote"
          description="Receba uma OC ou use o lançamento individual para saldo inicial."
        />
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
          <table className="hidden w-full text-left text-sm lg:table">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3 text-right">Físico</th>
                <th className="px-4 py-3 text-right">Reservado</th>
                <th className="px-4 py-3 text-right">Disponível</th>
                <th className="px-4 py-3 text-right">Custo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{row.product?.displayNome || '—'}</p>
                    <p className="text-xs text-slate-500">
                      {row.embalagem} · {row.local}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {row.origem_tipo === 'compra' ? row.ocNumero || 'OC' : 'Ajuste'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatQtyBoth(row.quantidade_kg)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatQtyBoth(row.reservado_kg)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">
                    {formatQtyBoth(row.disponivelKg)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {formatUsd(row.custo_usd_liquido)}
                    <span className="block text-xs text-slate-500">
                      {row.custo_unitario_brl != null
                        ? formatBRL(Number(row.custo_unitario_brl))
                        : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.disponivelKg > 0.0001 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={() => setAjuste({ tipo: 'saida', lote: row })}
                      >
                        Saída
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="flex flex-col gap-3 p-4 lg:hidden">
            {filtered.map((row) => (
              <li key={row.id} className="rounded-2xl border border-slate-200 p-4">
                <p className="font-semibold">{row.product?.displayNome || '—'}</p>
                <p className="text-sm text-slate-600">
                  {row.origem_tipo === 'compra' ? row.ocNumero || 'OC' : 'Ajuste'} · disp.{' '}
                  {formatQtyBoth(row.disponivelKg)}
                </p>
                {row.disponivelKg > 0.0001 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="mt-3 w-full"
                    onClick={() => setAjuste({ tipo: 'saida', lote: row })}
                  >
                    Saída
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ajuste === 'entrada' ? (
        <ModalAjusteEntrada
          onClose={() => setAjuste(null)}
          onDone={() => {
            setAjuste(null)
            setReloadKey((k) => k + 1)
          }}
        />
      ) : null}
      {ajuste?.tipo === 'saida' ? (
        <ModalAjusteSaida
          lote={ajuste.lote}
          onClose={() => setAjuste(null)}
          onDone={() => {
            setAjuste(null)
            setReloadKey((k) => k + 1)
          }}
        />
      ) : null}
    </div>
  )
}

function ModalAjusteEntrada({ onClose, onDone }) {
  const [fornecedores, setFornecedores] = useState([])
  const [produtos, setProdutos] = useState([])
  const [fornecedorId, setFornecedorId] = useState('')
  const [produtoId, setProdutoId] = useState('')
  const [embalagem, setEmbalagem] = useState(COMPRAS_EMBALAGEM_DEFAULT)
  const [unidade, setUnidade] = useState('t')
  const [qty, setQty] = useState('')
  const [custoUsd, setCustoUsd] = useState('')
  const [custoBrl, setCustoBrl] = useState('')
  const [obs, setObs] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useAbortableAsync(async (_s, isActive) => {
    const res = await fetchFornecedoresAtivos()
    if (!isActive()) return
    if (res.ok) {
      setFornecedores(res.rows)
      setFornecedorId(res.rows[0]?.id ?? '')
    }
  }, [])

  useAbortableAsync(
    async (_s, isActive) => {
      if (!fornecedorId) {
        setProdutos([])
        return
      }
      const res = await fetchProdutosPorFornecedor(fornecedorId)
      if (!isActive()) return
      if (res.ok) {
        setProdutos(res.rows)
        setProdutoId(res.rows[0]?.id ?? '')
      }
    },
    [fornecedorId],
  )

  async function handleSubmit(e) {
    e.preventDefault()
    const parsed = parseQtyInput(qty, unidade)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    const res = await ajusteEntrada({
      produtoOficialId: produtoId,
      embalagem,
      quantidadeKg: parsed.kg,
      custoUsdLiquido: custoUsd === '' ? null : Number(custoUsd),
      custoUnitarioBrl: custoBrl === '' ? null : Number(custoBrl),
      observacao: obs,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Lançamento individual · entrada"
      footer={
        <ModalFormFooter formId="ajuste-in" submitLabel="Lançar" loading={saving} onCancel={onClose} />
      }
    >
      {error ? <AlertMessage className="mb-4">{error}</AlertMessage> : null}
      <form id="ajuste-in" className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
        <Select
          label="Fornecedor"
          value={fornecedorId}
          onChange={(e) => setFornecedorId(e.target.value)}
          options={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
        />
        <Select
          label="Produto"
          value={produtoId}
          onChange={(e) => setProdutoId(e.target.value)}
          options={produtos.map((p) => ({ value: p.id, label: p.displayNome }))}
        />
        <Select
          label="Embalagem"
          value={embalagem}
          onChange={(e) => setEmbalagem(e.target.value)}
          options={EMBALAGEM_OPTIONS}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Unidade"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            options={UNIDADE_OPTIONS}
          />
          <Input label="Quantidade" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Custo USD líquido" value={custoUsd} onChange={(e) => setCustoUsd(e.target.value)} />
          <Input label="Custo unitário R$" value={custoBrl} onChange={(e) => setCustoBrl(e.target.value)} />
        </div>
        <Input label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} />
      </form>
    </Modal>
  )
}

function ModalAjusteSaida({ lote, onClose, onDone }) {
  const [unidade, setUnidade] = useState('t')
  const [qty, setQty] = useState('')
  const [obs, setObs] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const parsed = parseQtyInput(qty, unidade)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    const res = await ajusteSaida({
      estoqueLoteId: lote.id,
      quantidadeKg: parsed.kg,
      observacao: obs,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Saída avulsa"
      footer={
        <ModalFormFooter formId="ajuste-out" submitLabel="Baixar" loading={saving} onCancel={onClose} />
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        {lote.product?.displayNome} · disponível {formatQtyBoth(lote.disponivelKg)}
      </p>
      {error ? <AlertMessage className="mb-4">{error}</AlertMessage> : null}
      <form id="ajuste-out" className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Unidade"
            value={unidade}
            onChange={(e) => setUnidade(e.target.value)}
            options={UNIDADE_OPTIONS}
          />
          <Input label="Quantidade" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </div>
        <Input label="Observação" value={obs} onChange={(e) => setObs(e.target.value)} />
      </form>
    </Modal>
  )
}
