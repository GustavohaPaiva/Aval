import { describe, expect, it } from 'vitest'
import {
  calcPrazoNegociacao,
  getAutonomiaPercentual,
  getFloorRatio,
  normalizeAutonomiaParams,
  todayDateOnly,
} from './autonomiaDesconto'

describe('autonomiaDesconto', () => {
  it('calcula prazo = pagamento − negociacao', () => {
    expect(calcPrazoNegociacao('2026-06-01', '2026-03-01')).toBe(92)
    expect(calcPrazoNegociacao('2026-03-15', '2026-03-01')).toBe(14)
  })

  it('usa faixa longa em prazo >= limiar e curto abaixo', () => {
    const params = normalizeAutonomiaParams(null)
    expect(
      getAutonomiaPercentual({
        prazoDias: 90,
        classe: 'Especial',
        params,
      }),
    ).toBe(3)
    expect(
      getAutonomiaPercentual({
        prazoDias: 89,
        classe: 'Especial',
        params,
      }),
    ).toBe(4.5)
    expect(
      getAutonomiaPercentual({
        prazoDias: 100,
        classe: 'Convencional',
        params,
      }),
    ).toBe(4)
    expect(
      getAutonomiaPercentual({
        prazoDias: 10,
        classe: 'Convencional',
        params,
      }),
    ).toBe(5.5)
  })

  it('converte autonomia em floor ratio', () => {
    expect(getFloorRatio(3)).toBeCloseTo(0.97)
    expect(getFloorRatio(4.5)).toBeCloseTo(0.955)
  })

  it('todayDateOnly retorna YYYY-MM-DD', () => {
    expect(todayDateOnly()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
