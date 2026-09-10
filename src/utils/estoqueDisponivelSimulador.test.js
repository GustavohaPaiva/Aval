import { describe, expect, it } from 'vitest'
import {
  indexEstoqueDisponivel,
  lookupEstoqueDisponivelKg,
} from './estoqueDisponivelSimulador'

const rows = [
  {
    produto_oficial_id: 'q1',
    nome: '00 00 60 KCl',
    referencia_complementar: '-',
    fornecedor_id: 'forn-a',
    disponivel_kg: 22000,
  },
  {
    produto_oficial_id: 'q2-other',
    nome: '00 21 00 16H2O',
    referencia_complementar: '18Ca 10S',
    fornecedor_id: 'forn-a',
    disponivel_kg: 21000,
  },
]

describe('lookupEstoqueDisponivelKg', () => {
  const index = indexEstoqueDisponivel(rows)

  it('encontra pelo id oficial', () => {
    expect(lookupEstoqueDisponivelKg(index, { id: 'q1' })).toBe(22000)
  })

  it('encontra o mesmo produto em outro quarter (nome + fornecedor + ref)', () => {
    const kg = lookupEstoqueDisponivelKg(index, {
      id: 'q3-catalog',
      nome: '00 00 60 KCl',
      fornecedorId: 'forn-a',
      referenciaComplementar: '-',
    })
    expect(kg).toBe(22000)
  })

  it('não mostra nada se o produto não tem saldo', () => {
    expect(
      lookupEstoqueDisponivelKg(index, {
        id: 'missing',
        nome: 'MAP',
        fornecedorId: 'forn-a',
        referenciaComplementar: '',
      }),
    ).toBe(0)
  })
})
