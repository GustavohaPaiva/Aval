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
  it('formata cotação CIF com BRL e data de pagamento', () => {
    const text = formatPedidoCotacaoMensagem(sampleBundle())
    expect(text).toContain('Cotação:')
    expect(text).toContain('Cliente: Cliente Exemplo')
    expect(text).toContain('Data de vencimento: 15/09/2026')
    expect(text).toContain('CIF — Fazenda Boa Vista')
    expect(text).toContain('Soja - 100 ton - YaraBasa Ideal Plus · Yara')
    expect(text).toContain('VU: R$')
    expect(text).toContain('VT: R$')
  })

  it('formata FOB sem endereço', () => {
    const text = formatPedidoCotacaoMensagem(
      sampleBundle({ simulation: { tipo_frete: 'FOB' } }),
    )
    expect(text).toContain('\nFOB\n')
    expect(text).not.toContain('CIF —')
  })
})
