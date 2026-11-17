import { describe, expect, it } from 'vitest'
import { saoPauloDateOnly } from './autonomiaDesconto'
import { newSimulationSaleFields } from './simulationSaleFields'

describe('campos automáticos da venda', () => {
  it('usa o dia de criação em America/Sao_Paulo e não reinterpreta data já gravada', () => {
    expect(saoPauloDateOnly('2026-01-01T02:30:00Z')).toBe('2025-12-31')
    expect(saoPauloDateOnly('2026-03-01T12:00:00Z')).toBe('2026-03-01')
    expect(saoPauloDateOnly('2026-08-04')).toBe('2026-08-04')
  })

  it('cria operação em reais, lançada, com a filial do perfil', () => {
    const fields = newSimulationSaleFields(
      { role: 'consultor', filial: 'NOVA PONTE' },
      new Date('2026-01-01T02:30:00Z'),
    )
    expect(fields).toEqual({
      data_negociacao: '2025-12-31',
      filial_venda: 'nova-ponte',
      tipo_venda: 'reais',
      status_lancamento: 'lancado',
    })
    expect(fields.safra).toBeUndefined()
    expect(newSimulationSaleFields({ role: 'gestor' }, new Date('2026-06-01T15:00:00Z')).filial_venda).toBe('uberaba')
  })
})
