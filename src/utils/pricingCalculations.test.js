import { describe, expect, it } from 'vitest'
import {
  calcDiasAntecipacao,
  calcFatorAntecipacao,
  calcFatorIcms,
  calcFatorJuros,
  calcCustoIcmsFromBrl,
  calcMargemLucro,
  calcMargemLucroValor,
  calcMargemRatio,
  calcPrecoSimulacao,
  DEFAULT_MARGEM_PERCENTUAL,
} from './pricingCalculations'

describe('pricingCalculations', () => {
  it('calcula dias = data_pagamento − vencimento_da_lista', () => {
    expect(calcDiasAntecipacao('2026-03-01', '2026-03-15')).toBe(-14)
    expect(calcDiasAntecipacao('2026-03-20', '2026-03-15')).toBe(5)
    expect(calcDiasAntecipacao('2026-03-15', '2026-03-15')).toBe(0)
  })

  it('aceita datas ISO com hora (ex.: retorno do Supabase)', () => {
    expect(
      calcDiasAntecipacao('2026-03-01T00:00:00+00:00', '2026-03-15T12:00:00.000Z'),
    ).toBe(-14)
  })

  it('converte margem % dos parâmetros no ratio da planilha', () => {
    expect(calcMargemRatio(15)).toBeCloseTo(0.85, 6)
    expect(calcMargemRatio(10)).toBeCloseTo(0.9, 6)
    expect(calcMargemRatio(DEFAULT_MARGEM_PERCENTUAL)).toBeCloseTo(0.85, 6)
    expect(calcMargemRatio(100)).toBeCloseTo(0.85, 6)
    expect(calcMargemRatio(-1)).toBeCloseTo(0.85, 6)
  })

  it('pagamento antes do vencimento: divide pelo fator de antecipação', () => {
    const dias = -30
    const fator = calcFatorAntecipacao(dias)
    expect(fator).toBeCloseTo(1.017, 6)

    const result = calcPrecoSimulacao({
      custoIcms: 1000,
      freteUnitario: 50,
      diasAntecipacao: dias,
    })
    expect(result.valorComFrete).toBe(1050)
    expect(result.fator).toBeCloseTo(fator, 6)
    expect(result.valorAjustado).toBeCloseTo(1050 / fator, 2)
    expect(result.precoFinal).toBeCloseTo(
      result.valorAjustado / calcMargemRatio(DEFAULT_MARGEM_PERCENTUAL),
      2,
    )
    // antecipação reduz o base financeiro (desconto)
    expect(result.valorAjustado).toBeLessThan(result.valorComFrete)
  })

  it('pagamento depois do vencimento: divide pelo fator de juros', () => {
    const dias = 30
    const fator = calcFatorJuros(dias)
    expect(fator).toBeCloseTo(0.98, 6)

    const result = calcPrecoSimulacao({
      custoIcms: 1000,
      freteUnitario: 50,
      diasAntecipacao: dias,
    })
    expect(result.valorComFrete).toBe(1050)
    expect(result.fator).toBeCloseTo(fator, 6)
    expect(result.valorAjustado).toBeCloseTo(1050 / fator, 2)
    expect(result.precoFinal).toBeCloseTo(
      result.valorAjustado / calcMargemRatio(DEFAULT_MARGEM_PERCENTUAL),
      2,
    )
    // juros elevam o base financeiro (acréscimo)
    expect(result.valorAjustado).toBeGreaterThan(result.valorComFrete)
  })

  it('pagamento no dia do vencimento: sem ajuste financeiro', () => {
    const result = calcPrecoSimulacao({
      custoIcms: 850,
      freteUnitario: 0,
      diasAntecipacao: 0,
    })
    expect(result.valorComFrete).toBe(850)
    expect(result.fator).toBe(1)
    expect(result.valorAjustado).toBe(850)
    expect(result.precoFinal).toBeCloseTo(
      850 / calcMargemRatio(DEFAULT_MARGEM_PERCENTUAL),
      2,
    )
  })

  it('aplica margem parametrizada sobre o valor ajustado, não sobre o frete bruto', () => {
    const result = calcPrecoSimulacao({
      custoIcms: 1000,
      freteUnitario: 0,
      diasAntecipacao: -30,
      margemPercentual: 15,
    })
    const ajustado = 1000 / calcFatorAntecipacao(-30)
    expect(result.precoFinal).toBeCloseTo(ajustado / 0.85, 2)
    expect(result.precoFinal).not.toBeCloseTo(1000 / 0.85, 2)

    const result10 = calcPrecoSimulacao({
      custoIcms: 1000,
      freteUnitario: 0,
      diasAntecipacao: 0,
      margemPercentual: 10,
    })
    expect(result10.precoFinal).toBeCloseTo(1000 / 0.9, 2)
  })

  it('aceita taxas customizadas de antecipação e juros', () => {
    const diasAnt = -30
    const fatorAnt = calcFatorAntecipacao(diasAnt, 3.4)
    expect(fatorAnt).toBeCloseTo(1.034, 6)

    const resultAnt = calcPrecoSimulacao({
      custoIcms: 1000,
      freteUnitario: 0,
      diasAntecipacao: diasAnt,
      taxaAntecipacao: 3.4,
    })
    expect(resultAnt.fator).toBeCloseTo(fatorAnt, 6)
    expect(resultAnt.valorAjustado).toBeCloseTo(1000 / fatorAnt, 2)

    const diasJuros = 30
    const fatorJuros = calcFatorJuros(diasJuros, 4)
    expect(fatorJuros).toBeCloseTo(0.96, 6)

    const resultJuros = calcPrecoSimulacao({
      custoIcms: 1000,
      freteUnitario: 0,
      diasAntecipacao: diasJuros,
      taxaJuros: 4,
    })
    expect(resultJuros.fator).toBeCloseTo(fatorJuros, 6)
    expect(resultJuros.valorAjustado).toBeCloseTo(1000 / fatorJuros, 2)
  })

  it('calcula margem sobre a proposta após ICMS e PIS/COFINS', () => {
    // (1000 − 40 − 10 − 800) / 1000 = 0.15
    expect(calcMargemLucro(1000, 800, 4, 1)).toBeCloseTo(0.15, 6)
    // sem impostos: (1100 − 1000) / 1100
    expect(calcMargemLucro(1100, 1000, 0, 0)).toBeCloseTo(100 / 1100, 6)
    expect(calcMargemLucro(1000, 1000, 0, 0)).toBeCloseTo(0, 6)
    expect(calcMargemLucro(0, 100, 4, 1)).toBeNull()
    // null nos % → 0 (não aplica imposto)
    expect(calcMargemLucro(1000, 800, null, null)).toBeCloseTo(0.2, 6)
    // defaults: ICMS 4%, PIS 0
    expect(calcMargemLucro(1000, 800)).toBeCloseTo(0.16, 6)
  })

  it('calcula margem em R$ após ICMS e PIS/COFINS', () => {
    expect(calcMargemLucroValor(1000, 800, 4, 1)).toBe(150)
    expect(calcMargemLucroValor(1000, 1000, 0, 0)).toBe(0)
    expect(calcMargemLucroValor(900, 1000, 0, 0)).toBe(-100)
  })

  it('calcula custo ICMS a partir do percentual parametrizado', () => {
    expect(calcFatorIcms(4)).toBeCloseTo(0.96, 6)
    expect(calcFatorIcms(5)).toBeCloseTo(0.95, 6)
    expect(calcCustoIcmsFromBrl(1000, 4)).toBe(960)
    expect(calcCustoIcmsFromBrl(1000, 5)).toBe(950)
  })
})
