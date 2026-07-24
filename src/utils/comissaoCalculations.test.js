import { describe, expect, it } from 'vitest'
import {
  calcComissaoLinha,
  calcComissaoValor,
  normalizeTipoComissao,
  resolveComissaoPercentual,
  toMargemPercentual,
} from './comissaoCalculations'

const FAIXAS = [
  { tipo_produto: 'Convencional', margem_minima_percentual: 3, comissao_percentual: 0.3 },
  { tipo_produto: 'Convencional', margem_minima_percentual: 4, comissao_percentual: 0.4 },
  { tipo_produto: 'Convencional', margem_minima_percentual: 5, comissao_percentual: 0.5 },
  { tipo_produto: 'Convencional', margem_minima_percentual: 6, comissao_percentual: 0.5 },
  { tipo_produto: 'Convencional', margem_minima_percentual: 7, comissao_percentual: 0.5 },
  { tipo_produto: 'Especial', margem_minima_percentual: 3, comissao_percentual: 0.6 },
  { tipo_produto: 'Especial', margem_minima_percentual: 4, comissao_percentual: 0.8 },
  { tipo_produto: 'Especial', margem_minima_percentual: 5, comissao_percentual: 1.0 },
  { tipo_produto: 'Especial', margem_minima_percentual: 6, comissao_percentual: 1.25 },
  { tipo_produto: 'Especial', margem_minima_percentual: 7, comissao_percentual: 1.5 },
]

describe('comissaoCalculations', () => {
  it('normaliza classe do produto', () => {
    expect(normalizeTipoComissao('Especial')).toBe('Especial')
    expect(normalizeTipoComissao('especial')).toBe('Especial')
    expect(normalizeTipoComissao('Convencional')).toBe('Convencional')
    expect(normalizeTipoComissao(null)).toBe('Convencional')
  })

  it('converte margem ratio e percentual', () => {
    expect(toMargemPercentual(0.05)).toBeCloseTo(5, 6)
    expect(toMargemPercentual(5)).toBe(5)
    expect(toMargemPercentual(null)).toBeNull()
  })

  it('resolve faixas convencionais', () => {
    expect(resolveComissaoPercentual(2.9, 'Convencional', FAIXAS)).toBe(0)
    expect(resolveComissaoPercentual(3, 'Convencional', FAIXAS)).toBe(0.3)
    expect(resolveComissaoPercentual(3.5, 'Convencional', FAIXAS)).toBe(0.3)
    expect(resolveComissaoPercentual(4, 'Convencional', FAIXAS)).toBe(0.4)
    expect(resolveComissaoPercentual(5, 'Convencional', FAIXAS)).toBe(0.5)
    expect(resolveComissaoPercentual(6, 'Convencional', FAIXAS)).toBe(0.5)
    expect(resolveComissaoPercentual(7, 'Convencional', FAIXAS)).toBe(0.5)
    expect(resolveComissaoPercentual(12, 'Convencional', FAIXAS)).toBe(0.5)
  })

  it('resolve faixas especiais', () => {
    expect(resolveComissaoPercentual(3, 'Especial', FAIXAS)).toBe(0.6)
    expect(resolveComissaoPercentual(4, 'Especial', FAIXAS)).toBe(0.8)
    expect(resolveComissaoPercentual(5, 'Especial', FAIXAS)).toBe(1.0)
    expect(resolveComissaoPercentual(6, 'Especial', FAIXAS)).toBe(1.25)
    expect(resolveComissaoPercentual(7, 'Especial', FAIXAS)).toBe(1.5)
    expect(resolveComissaoPercentual(10, 'Especial', FAIXAS)).toBe(1.5)
  })

  it('calcula valor da comissão', () => {
    expect(calcComissaoValor(10000, 0.5)).toBe(50)
    expect(calcComissaoValor(10000, 1.5)).toBe(150)
    expect(calcComissaoValor(0, 1)).toBe(0)
  })

  it('calcula linha a partir de margem ratio', () => {
    const line = calcComissaoLinha({
      margem: 0.05,
      classe: 'Especial',
      volume: 2,
      proposta: 5000,
      faixas: FAIXAS,
    })
    expect(line.margemPercentual).toBeCloseTo(5, 6)
    expect(line.comissaoPercentual).toBe(1)
    expect(line.baseCalculo).toBe(10000)
    expect(line.comissaoValor).toBe(100)
  })
})
