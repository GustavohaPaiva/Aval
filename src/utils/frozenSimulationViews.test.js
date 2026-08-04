import { describe, expect, it } from 'vitest'
import {
  buildFrozenLineView,
  buildFrozenTotals,
  isSimulationFrozen,
} from './frozenSimulationViews'

describe('frozenSimulationViews', () => {
  it('monta linha congelada a partir dos valores persistidos', () => {
    const row = buildFrozenLineView(
      {
        id: '1',
        product_id: 'p1',
        volume: 10,
        preco_unitario: 100,
        proposta: 95,
        financeiro_unitario: 80,
        margem_percentual: 15.7895,
        comissao_percentual: 2,
        comissao_valor: 19,
        produto_classe: 'NPK',
        cultura: 'Soja',
      },
      'Produto X',
    )

    expect(row.frozen).toBe(true)
    expect(row.precoUnitario).toBe(100)
    expect(row.proposta).toBe(95)
    expect(row.valorTotal).toBe(1000)
    expect(row.propostaTotal).toBe(950)
    expect(row.financeiro).toBe(80)
    expect(row.financeiroTotal).toBe(800)
    expect(row.displayNome).toBe('Produto X')
    expect(row.comissaoValor).toBe(19)
  })

  it('não muda totais quando os valores congelados são fixos', () => {
    const lines = [
      buildFrozenLineView(
        {
          id: '1',
          product_id: 'p1',
          volume: 2,
          preco_unitario: 200,
          proposta: 180,
          financeiro_unitario: 150,
          margem_percentual: 16.6667,
          comissao_valor: 5,
        },
        'A',
      ),
    ]
    const totalsA = buildFrozenTotals(lines, {
      total_bruto: 400,
      total_proposta: 360,
    })
    const totalsB = buildFrozenTotals(lines, {
      total_bruto: 400,
      total_proposta: 360,
    })
    expect(totalsA).toEqual(totalsB)
    expect(totalsA.totalValor).toBe(400)
    expect(totalsA.totalProposta).toBe(360)
    expect(totalsA.comissaoValorTotal).toBe(5)
  })

  it('identifica simulação congelada por status de pedido ou flag', () => {
    expect(isSimulationFrozen({ status: 'converted' })).toBe(true)
    expect(isSimulationFrozen({ status: 'order_pending' })).toBe(true)
    expect(
      isSimulationFrozen({
        status: 'draft',
        valores_congelados_em: '2026-08-01T12:00:00Z',
      }),
    ).toBe(true)
    expect(isSimulationFrozen({ status: 'draft' })).toBe(false)
    expect(isSimulationFrozen({ status: 'pending' })).toBe(false)
  })
})
