import { Card } from '../ui/Card'
import { SimuladorSummaryBar } from '../simulador/SimuladorVisuals'
import { formatBRL, formatPercent } from '../../utils/money'
import {
  buildFrozenLineView,
  buildFrozenTotals,
} from '../../utils/frozenSimulationViews'

function productDisplayName(item) {
  if (!item?.product) return '—'
  const p = item.product
  return (
    p.nome ||
    [p.sku_fornecedor, p.referencia_complementar].filter(Boolean).join(' ') ||
    '—'
  )
}

/**
 * Resumo read-only da simulação congelada para a tela de pedido do gestor.
 */
export function PedidoSimulationSummary({ bundle }) {
  if (!bundle) return null

  const lineViews = (bundle.items ?? [])
    .filter((it) => it.product_id)
    .map((it) =>
      buildFrozenLineView(
        {
          ...it,
          overrides: {
            custoUsd: it.override_custo_usd ?? undefined,
            descontoUsd: it.override_desconto_usd ?? undefined,
            taxa: it.override_taxa ?? undefined,
            frete: it.override_frete ?? undefined,
            taxaAntecipacao: it.override_taxa_antecipacao ?? undefined,
            taxaJuros: it.override_taxa_juros ?? undefined,
          },
        },
        productDisplayName(it),
      ),
    )

  const totals = buildFrozenTotals(lineViews, bundle.simulation)
  const client = bundle.client
  const sim = bundle.simulation

  const gestorAlteracaoLabel = sim.gestor_alteracao_em
    ? (() => {
        const when = new Date(sim.gestor_alteracao_em).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
        const resumo = sim.gestor_alteracao_resumo?.trim()
        return resumo
          ? `Alterado pelo gestor em ${when}: ${resumo}`
          : `Alterado pelo gestor em ${when}`
      })()
    : null

  return (
    <div className="mb-6 space-y-4">
      {gestorAlteracaoLabel ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          {gestorAlteracaoLabel}
        </div>
      ) : null}

      <Card className="rounded-3xl">
        <h2 className="mb-4 text-sm font-semibold text-primary-800">
          Simulação fechada
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Cliente
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">
              {client?.nome ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Frete
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">
              {[sim.tipo_frete, sim.origem_frete, sim.destino_frete]
                .filter(Boolean)
                .join(' · ') || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Pagamento / quarter
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">
              {[sim.data_pagamento, sim.quarter].filter(Boolean).join(' · ') ||
                '—'}
            </dd>
          </div>
        </dl>
      </Card>

      <SimuladorSummaryBar
        totalValor={totals.totalValor}
        totalProposta={totals.totalProposta}
        globalStatus={totals.globalStatus}
        showMargem
        margemLucroTotal={totals.margemLucroTotal}
        margemLucroValorTotal={totals.margemLucroValorTotal}
      />

      <Card className="overflow-hidden rounded-3xl p-0">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-primary-800">Produtos</h2>
        </div>

        <ul className="flex flex-col gap-3 p-3 lg:hidden">
          {lineViews.length === 0 ? (
            <li className="px-2 py-6 text-center text-sm text-slate-500">
              Nenhum produto nesta simulação.
            </li>
          ) : (
            lineViews.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {row.displayNome}
                </p>
                {row.cultura ? (
                  <p className="mt-0.5 text-xs text-slate-500">{row.cultura}</p>
                ) : null}
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>
                    <dt className="font-medium text-slate-500">Volume</dt>
                    <dd className="finance-text mt-0.5 text-slate-800">
                      {row.volume}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Margem</dt>
                    <dd className="finance-text mt-0.5 text-slate-800">
                      {formatPercent(row.margemLucro)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Preço tabela</dt>
                    <dd className="finance-text mt-0.5 text-slate-800">
                      {formatBRL(row.precoUnitario)}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500">Proposta</dt>
                    <dd className="finance-text mt-0.5 text-slate-800">
                      {formatBRL(row.proposta)}
                    </dd>
                  </div>
                  <div className="col-span-2 rounded-xl border border-primary-100 bg-primary-50/50 px-2.5 py-2">
                    <dt className="font-medium text-primary-800">Total</dt>
                    <dd className="finance-text mt-0.5 text-sm font-semibold text-slate-900">
                      {formatBRL(row.propostaTotal)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))
          )}
        </ul>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Produto</th>
                <th className="px-4 py-3 font-semibold">Volume</th>
                <th className="px-4 py-3 font-semibold">Preço tabela</th>
                <th className="px-4 py-3 font-semibold">Proposta</th>
                <th className="px-4 py-3 font-semibold">Margem</th>
                <th className="px-4 py-3 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineViews.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {row.displayNome}
                    {row.cultura ? (
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                        {row.cultura}
                      </span>
                    ) : null}
                  </td>
                  <td className="finance-text px-4 py-3 text-slate-700">
                    {row.volume}
                  </td>
                  <td className="finance-text px-4 py-3 text-slate-700">
                    {formatBRL(row.precoUnitario)}
                  </td>
                  <td className="finance-text px-4 py-3 text-slate-700">
                    {formatBRL(row.proposta)}
                  </td>
                  <td className="finance-text px-4 py-3 text-slate-700">
                    {formatPercent(row.margemLucro)}
                  </td>
                  <td className="finance-text px-4 py-3 font-medium text-slate-900">
                    {formatBRL(row.propostaTotal)}
                  </td>
                </tr>
              ))}
              {lineViews.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    Nenhum produto nesta simulação.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
