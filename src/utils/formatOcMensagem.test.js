import { describe, expect, it } from 'vitest'
import { formatOcMensagem } from './formatOcMensagem'

describe('formatOcMensagem', () => {
  it('envia só o USD líquido e replica a planta da filial', () => {
    const msg = formatOcMensagem(
      {
        numero: 'OC-1',
        filial_site: 'uberaba',
        data_documento: '2026-09-16',
        condicao_pagamento: 'FAT. ANTECIPADO',
        tipo_entrega: 'FOB',
        cidade_retirada: 'Uberaba',
      },
      [
        {
          product: { displayNome: 'MAP' },
          embalagem: 'BIG BAG',
          volume_kg: 1000,
          unidade_exibicao: 't',
          preco_usd: 100,
          desconto_usd: 10,
        },
      ],
      'Yara',
    )
    expect(msg).toContain('Planta: Uberaba')
    expect(msg).toMatch(/USD: US\$\s*90,00/)
    expect(msg).not.toContain('Desc.')
    expect(msg).not.toContain('Pagamento Syagri')
  })
})
