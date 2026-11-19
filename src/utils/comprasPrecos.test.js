import { describe, expect, it } from 'vitest'
import {
  calcDiasJurosOc,
  calcOcItemValores,
  calcOcPrecoCorrigido,
  dolarNegociadoResumo,
  inferTaxaDolar,
  negociacaoDoItem,
  ocLiquidoUsd,
  ocUsdPedidoFornecedor,
  parseOcNumber,
  precoOcFromNegociacao,
  resolverTaxaDolarItem,
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

  it('não converte para reais sem a cotação negociada', () => {
    const valores = calcOcItemValores({
      precoUsd: 100,
      descontoUsd: 10,
      taxaDolar: null,
      volumeKg: 2000,
      unidade: 't',
    })
    expect(valores.liquidoUsd).toBe(90)
    expect(valores.unitarioBrl).toBeNull()
    expect(valores.total).toBeNull()
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

  it('preenche o dólar com o câmbio gravado na negociação', () => {
    const preco = precoOcFromNegociacao(
      {
        overrideTaxa: 5.33,
        custoBrlUnitario: 550,
        product: { preco_original: 100, desconto_usd: 0, taxaJuros: 2, quarter: 'Q1' },
      },
      { volumeKg: 1000, unidade: 't' },
    )
    expect(preco.taxa_dolar).toBe(5.33)
    expect(preco.unitario_brl).toBeCloseTo(533, 2)
  })

  it('recupera o dólar histórico pelo custo congelado, sem a cotação atual', () => {
    const preco = precoOcFromNegociacao(
      {
        overrideTaxa: null,
        custoBrlUnitario: 3587.38,
        cotacaoAtual: 9.99,
        product: {
          preco_original: 667.25,
          desconto_usd: 15,
          preco_interno_calculado: 9999,
          taxaJuros: 2,
          quarter: 'Q4',
        },
      },
      { volumeKg: 1000, unidade: 't' },
    )
    expect(preco.taxa_dolar).toBe(5.5)
    expect(preco.unitario_brl).toBeCloseTo(3587.38, 2)
  })

  it('não inventa dólar quando a negociação não registrou cotação', () => {
    const preco = precoOcFromNegociacao(
      {
        overrideTaxa: null,
        custoBrlUnitario: null,
        cotacaoAtual: 5.5,
        product: { preco_original: 100, desconto_usd: 0, taxaJuros: 2 },
      },
      { volumeKg: 1000, unidade: 't' },
    )
    expect(preco.taxa_dolar).toBeNull()
    expect(preco.unitario_brl).toBeNull()
    expect(preco.preco_corrigido).toBe(100)
  })

  it('não recupera taxa se o custo congelado não fecha com o dólar do item', () => {
    expect(
      precoOcFromNegociacao(
        {
          custoBrlUnitario: 3587.38,
          product: { preco_original: 800, desconto_usd: 0, taxaJuros: 2 },
        },
        { volumeKg: 1000, unidade: 't' },
      ).taxa_dolar,
    ).toBeNull()
  })

  it('edição salva prevalece ao reabrir e não volta para a negociação', () => {
    const reaberto = resolverTaxaDolarItem({
      taxa_dolar: 5.33,
      preco_usd: 100,
      desconto_usd: 0,
      preco_corrigido: 100,
      unitario_brl: 550,
      negociacao: { overrideTaxa: 5.5 },
    })
    expect(reaberto).toEqual({ taxa: 5.33, origem: 'salva' })
  })

  it('pedido antigo com unitário gravado mantém o dólar implícito', () => {
    const antigo = resolverTaxaDolarItem({
      taxa_dolar: null,
      preco_usd: 100,
      desconto_usd: 0,
      unitario_brl: 512,
      negociacao: { overrideTaxa: 5.5 },
    })
    expect(antigo.taxa).toBe(5.12)
    expect(antigo.origem).toBe('item')
  })

  it('pedido antigo sem cotação usa a negociação ligada e ignora taxas divergentes', () => {
    const item = {
      preco_usd: 667.25,
      desconto_usd: 15,
      unitario_brl: null,
      taxa_dolar: null,
    }
    const negociacao = negociacaoDoItem(item, [
      { override_taxa: null, custo_brl_unitario: 3587.38 },
    ])
    expect(resolverTaxaDolarItem({ ...item, negociacao }).taxa).toBe(5.5)
    expect(
      negociacaoDoItem(item, [
        { override_taxa: 5.5 },
        { override_taxa: 5.12 },
      ]),
    ).toBeNull()
  })

  it('o PDF usa o dólar efetivo e distingue taxas diferentes', () => {
    expect(
      dolarNegociadoResumo([
        { taxa_dolar: 5.33, preco_usd: 100, unitario_brl: 500 },
        { taxa_dolar: 5.33, preco_usd: 80, unitario_brl: 400 },
      ]),
    ).toMatchObject({ taxa: 5.33, unico: true, ausente: false })
    expect(
      dolarNegociadoResumo([
        { taxa_dolar: 5.33 },
        { taxa_dolar: 5.5 },
      ]),
    ).toMatchObject({ taxa: null, unico: false, ausente: false })
    expect(dolarNegociadoResumo([{ preco_usd: 100, desconto_usd: 0 }])).toMatchObject({
      ausente: true,
    })
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
