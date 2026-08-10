import { describe, expect, it } from 'vitest'
import {
  buildEnderecoEntregaCif,
  formatPedidoCotacaoMensagem,
} from './formatPedidoCotacaoMensagem'

function sampleBundle(overrides = {}) {
  return {
    simulation: {
      tipo_frete: 'CIF',
      data_pagamento: '2026-09-15',
      fazenda: 'Fazenda Boa Vista',
      pedido_municipio: 'Uberaba',
      pedido_uf: 'MG',
      destino_frete: 'UBERABA',
      ...(overrides.simulation ?? {}),
    },
    client: {
      nome: 'Cliente Exemplo',
      endereco: 'Rodovia BR-050, km 10',
      municipio: 'Uberaba',
      uf: 'MG',
      ...(overrides.client ?? {}),
    },
    items: overrides.items ?? [
      {
        product_id: 'p1',
        cultura: 'Soja',
        volume: 100,
        proposta: 4500,
        product: {
          nome: 'YaraBasa Ideal Plus',
          referencia_complementar: null,
          fornecedor_nome: 'Yara',
        },
      },
      {
        product_id: 'p2',
        cultura: 'Soja',
        volume: 50,
        proposta: 2900,
        product: {
          nome: 'KCl 00 00 60',
          referencia_complementar: null,
          fornecedor_nome: 'Cibra',
        },
      },
    ],
  }
}

describe('buildEnderecoEntregaCif', () => {
  it('monta endereço completo sem duplicar município/destino', () => {
    const bundle = sampleBundle()
    expect(buildEnderecoEntregaCif(bundle.simulation, bundle.client)).toBe(
      'Fazenda Boa Vista · Rodovia BR-050, km 10 · Uberaba / MG',
    )
  })
})

describe('formatPedidoCotacaoMensagem', () => {
  it('formata cotação CIF vertical com negrito WhatsApp', () => {
    const text = formatPedidoCotacaoMensagem(sampleBundle())
    expect(text).toContain('Cotação:')
    expect(text).toContain('Cliente: *Cliente Exemplo*')
    expect(text).toContain('Data de vencimento: 15/09/2026')
    expect(text).toContain('Tipo de entrega: CIF (destino: UBERABA)')
    expect(text).toContain('Cultura: Soja')
    expect(text).toContain('Volume: 100 ton')
    expect(text).toContain('Produto: YaraBasa Ideal Plus · Yara')
    expect(text).toContain('Val. Unt.: *')
    expect(text).toContain('Val. Tot.: *')
    expect(text).toContain(
      'Os preços estão sujeitos a alterações devido a variação cambial ou por retiradas de listas.',
    )
    expect(text.indexOf('Volume: 100 ton')).toBeLessThan(
      text.indexOf('Volume: 50 ton'),
    )
    expect(text).not.toContain('VU:')
    expect(text).not.toContain('Soja - 100 ton')
  })

  it('formata FOB sem destino', () => {
    const text = formatPedidoCotacaoMensagem(
      sampleBundle({ simulation: { tipo_frete: 'FOB' } }),
    )
    expect(text).toContain('Tipo de entrega: FOB')
    expect(text).not.toContain('destino:')
    expect(text).not.toContain('CIF')
  })

  it('repete bloco por produto com linha em branco entre eles', () => {
    const text = formatPedidoCotacaoMensagem(sampleBundle())
    expect(text).toMatch(
      /Cultura: Soja\nVolume: 100 ton\nProduto: YaraBasa Ideal Plus · Yara\nVal\. Unt\.: \*[^\n]+\*\nVal\. Tot\.: \*[^\n]+\*\n\nCultura: Soja\nVolume: 50 ton/,
    )
  })

  it('coloca o aviso uma vez no rodapé', () => {
    const text = formatPedidoCotacaoMensagem(sampleBundle())
    const aviso =
      'Os preços estão sujeitos a alterações devido a variação cambial ou por retiradas de listas.'
    expect(text.endsWith(aviso)).toBe(true)
    expect(text.split(aviso).length - 1).toBe(1)
  })
})
