import { describe, expect, it } from 'vitest'
import {
  calcOcItemValores,
  inferTaxaDolar,
  ocLiquidoUsd,
  parseOcNumber,
} from './comprasPrecos'

describe('comprasPrecos', () => {
  it('parseia número com vírgula', () => {
    expect(parseOcNumber('5,5')).toBe(5.5)
    expect(parseOcNumber('')).toBeNull()
  })

  it('desconto reduz o líquido USD', () => {
    expect(ocLiquidoUsd(100, 12)).toBe(88)
  })

  it('unitário = total / quantidade e muda com o desconto', () => {
    const base = calcOcItemValores({
      precoUsd: 100,
      descontoUsd: 10,
      taxaDolar: 5,
      volumeKg: 2000,
      unidade: 't',
    })
    expect(base.unitarioBrl).toBe(450)
    expect(base.total).toBe(900)
    expect(base.unitarioBrl).toBeCloseTo(base.total / base.qty)

    const comMaisDesconto = calcOcItemValores({
      precoUsd: 100,
      descontoUsd: 20,
      taxaDolar: 5,
      volumeKg: 2000,
      unidade: 't',
    })
    expect(comMaisDesconto.unitarioBrl).toBe(400)
    expect(comMaisDesconto.unitarioBrl).toBeLessThan(base.unitarioBrl)
  })

  it('infere o dólar a partir do unitário já salvo', () => {
    expect(
      inferTaxaDolar({
        precoUsd: 100,
        descontoUsd: 20,
        unitarioBrl: 400,
      }),
    ).toBe(5)
  })
})
