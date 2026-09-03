import { describe, expect, it } from 'vitest'
import {
  formatBRL,
  formatComissaoPctValor,
  formatPercentPoints,
} from './money'

describe('money formatters', () => {
  it('formata pontos percentuais de comissão', () => {
    expect(formatPercentPoints(0.5)).toBe('0,50%')
    expect(formatPercentPoints(1.25)).toBe('1,25%')
    expect(formatPercentPoints(null)).toBe('—')
  })

  it('exibe comissão como % / R$', () => {
    expect(formatComissaoPctValor(0.5, 50)).toBe(`0,50% / ${formatBRL(50)}`)
    expect(formatComissaoPctValor(null, 0)).toBe(`0,00% / ${formatBRL(0)}`)
  })
})
