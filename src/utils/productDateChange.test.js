import { describe, expect, it } from 'vitest'
import { productsForLineSelect } from '../components/simulador/productSelectOptions'
import {
  calcDiasAntecipacao,
  calcPrecoSimulacao,
} from './pricingCalculations'
import { syncLineOnTableChange } from './simulationPropostaLock'

const catalog = [
  {
    id: 'p1',
    nome: 'MAP',
    displayNome: 'MAP',
    fornecedorId: 'f1',
    fornecedorNome: 'Fornecedor A',
  },
  {
    id: 'p2',
    nome: 'KCl',
    displayNome: 'KCl',
    fornecedorId: 'f2',
    fornecedorNome: 'Fornecedor B',
  },
]

describe('productsForLineSelect', () => {
  it('filtra por fornecedor', () => {
    const rows = productsForLineSelect(catalog, { fornecedorId: 'f1' })
    expect(rows.map((p) => p.id)).toEqual(['p1'])
  })

  it('mantém o produto selecionado mesmo fora do filtro de fornecedor', () => {
    const rows = productsForLineSelect(catalog, {
      fornecedorId: 'f1',
      productId: 'p2',
      displayNome: 'KCl',
    })
    expect(rows.map((p) => String(p.id))).toEqual(['p2', 'p1'])
  })

  it('cria fallback quando o id não está no catálogo', () => {
    const rows = productsForLineSelect(catalog, {
      productId: 'ghost',
      displayNome: 'Produto fantasma',
    })
    expect(rows[0]).toMatchObject({
      id: 'ghost',
      displayNome: 'Produto fantasma',
    })
    expect(rows).toHaveLength(catalog.length + 1)
  })
})

describe('troca de data de pagamento', () => {
  it('mantém productId e recalcula preço/proposta quando a data muda', () => {
    const vencimentoLista = '2026-06-30'
    const custoIcms = 1000
    const line = {
      id: 'line-1',
      productId: 'p1',
      proposta: 0,
      descontoPct: 0,
    }

    const diasAntes = calcDiasAntecipacao('2026-05-01', vencimentoLista)
    const tabelaAntes = calcPrecoSimulacao({
      custoIcms,
      freteUnitario: 50,
      diasAntecipacao: diasAntes,
    })
    const afterSelect = {
      ...line,
      proposta: tabelaAntes.precoFinal,
      descontoPct: 0,
    }

    const diasDepois = calcDiasAntecipacao('2026-08-01', vencimentoLista)
    const tabelaDepois = calcPrecoSimulacao({
      custoIcms,
      freteUnitario: 50,
      diasAntecipacao: diasDepois,
    })

    expect(diasAntes).not.toBe(diasDepois)
    expect(tabelaDepois.precoFinal).not.toBe(tabelaAntes.precoFinal)

    const synced = syncLineOnTableChange(afterSelect, {
      precoUnitario: tabelaDepois.precoFinal,
      floorUnit: tabelaDepois.precoFinal * 0.9,
      canOverrideFloor: false,
      lockProposta: false,
    })

    expect(synced.productId).toBe('p1')
    expect(synced.proposta).toBe(tabelaDepois.precoFinal)
    expect(synced.descontoPct).toBe(0)
  })
})
