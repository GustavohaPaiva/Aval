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
    expect(msg).toContain('Faturamento: Faturar p/Uberaba - MG')
    expect(msg).toMatch(/USD: US\$\s*90,00/)
    expect(msg).not.toContain('Desc.')
    expect(msg).not.toContain('Pagamento Syagri')
  })

  it('envia o USD já corrigido com juros simples', () => {
    const msg = formatOcMensagem(
      {
        numero: 'OC-2',
        filial_site: 'uberaba',
        data_documento: '2026-07-31',
        condicao_pagamento: 'FAT. ANTECIPADO',
        tipo_entrega: 'FOB',
        cidade_retirada: 'Uberaba',
      },
      [
        {
          product: { displayNome: 'YARABASA ABSOLUTO', quarter: 'Q3', taxaJuros: 2 },
          embalagem: 'BIG BAG',
          volume_kg: 24000,
          unidade_exibicao: 't',
          preco_usd: 858,
          desconto_usd: 20,
          vencimento_lista: '2026-08-31',
          pagamento_syagri: '2027-03-01',
          cultura: 'Batata',
          origem: 'UBA',
        },
      ],
      'YARA',
    )
    expect(msg).toMatch(/USD: US\$\s*939,6773/)
    expect(msg).toContain('Cultura: Batata')
    expect(msg).toContain('Origem: UBA')
    expect(msg).toContain('Lista: Q3')
    expect(msg).not.toContain('Pagamento Syagri')
  })

  it('usa faturamento, CTC e lista editados', () => {
    const msg = formatOcMensagem(
      {
        numero: 'OC-3',
        filial_site: 'uberaba',
        data_documento: '2026-07-31',
        condicao_pagamento: 'FAT. ANTECIPADO',
        tipo_entrega: 'FOB',
        cidade_retirada: 'Uberaba',
        faturamento: 'Faturar p/Nova Ponte - MG',
        entrega_retirada: 'S1 Setembro',
        ctc: 'Eder',
      },
      [
        {
          product: { displayNome: 'MAP', quarter: 'Q3' },
          lista: 'Q4',
          embalagem: 'BIG BAG',
          volume_kg: 1000,
          unidade_exibicao: 't',
          preco_usd: 100,
          desconto_usd: 0,
        },
      ],
      'YARA',
    )
    expect(msg).toContain('Faturamento: Faturar p/Nova Ponte - MG')
    expect(msg).toContain('Entrega/retirada: S1 Setembro')
    expect(msg).toContain('CTC: Eder')
    expect(msg).toContain('Lista: Q4')
  })
})
