import { describe, expect, it } from 'vitest'
import {
  calcDiasJurosOc,
  calcOcItemValores,
  calcOcPrecoCorrigido,
  inferTaxaDolar,
  ocLiquidoUsd,
  ocUsdPedidoFornecedor,
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

  it('juros simples da planilha Yara: F*(1+0.02*(dias/30))', () => {
    expect(calcDiasJurosOc('2026-08-31', '2027-03-01')).toBe(182)
    expect(calcDiasJurosOc('2026-08-31', '2026-08-31')).toBe(0)
    expect(calcDiasJurosOc('2026-08-31', '2026-07-01')).toBe(0)

    const corrigido = calcOcPrecoCorrigido(838, 182, 2)
    expect(corrigido).toBeCloseTo(939.6773, 4)

    const valores = calcOcItemValores({
      precoUsd: 858,
      descontoUsd: 20,
      taxaDolar: 5.07,
      volumeKg: 24000,
      unidade: 't',
      vencimentoLista: '2026-08-31',
      pagamentoSyagri: '2027-03-01',
      taxaJuros: 2,
      frete: 0,
    })
    expect(valores.liquidoUsd).toBe(838)
    expect(valores.precoCorrigido).toBeCloseTo(939.6773, 4)
    expect(valores.juros).toBeCloseTo(101.6773, 4)
    expect(valores.unitarioBrl).toBeCloseTo(4764.16, 2)
    expect(valores.total).toBeCloseTo(114339.84, 2)
  })

  it('total soma frete no unitário da planilha', () => {
    const valores = calcOcItemValores({
      precoUsd: 100,
      descontoUsd: 10,
      taxaDolar: 5,
      volumeKg: 2000,
      unidade: 't',
      frete: 50,
    })
    expect(valores.unitarioBrl).toBe(450)
    expect(valores.total).toBe(1000)
  })

  it('USD do pedido ao fornecedor usa o preço corrigido', () => {
    expect(
      ocUsdPedidoFornecedor({
        preco_usd: 858,
        desconto_usd: 20,
        vencimento_lista: '2026-08-31',
        pagamento_syagri: '2027-03-01',
        product: { taxaJuros: 2 },
      }),
    ).toBeCloseTo(939.6773, 4)
  })
})
