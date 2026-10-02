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

  it('usa filial de faturamento, CTC e lista editados', () => {
    const msg = formatOcMensagem(
      {
        numero: 'OC-3',
        filial_site: 'uberaba',
        filial_faturamento: 'nova-ponte',
        data_documento: '2026-07-31',
        condicao_pagamento: 'FAT. ANTECIPADO',
        tipo_entrega: 'FOB',
        cidade_retirada: 'Uberaba',
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

  it('cidade segue a planta e mostra vencimento, R$, frete zero e total da OC', () => {
    const msg = formatOcMensagem(
      {
        numero: 'OC-4',
        filial_site: 'ituverava',
        filial_faturamento: 'ituverava',
        data_documento: '2026-09-01',
        condicao_pagamento: 'FAT. ANTECIPADO',
        tipo_entrega: 'cif',
        cidade_retirada: 'Uberaba',
      },
      [
        {
          product: { displayNome: 'MAP' },
          embalagem: 'BIG BAG',
          volume_kg: 2000,
          unidade_exibicao: 't',
          preco_usd: 100,
          desconto_usd: 0,
          pagamento_syagri: '2026-10-30',
          unitario_brl: 550,
          frete: null,
          total: 1100,
        },
        {
          product: { displayNome: 'KCL' },
          embalagem: 'BIG BAG',
          volume_kg: 1000,
          unidade_exibicao: 't',
          preco_usd: 200,
          desconto_usd: 0,
          pagamento_syagri: '2026-10-30',
          unitario_brl: 1100,
          frete: 50,
          total: 1150,
        },
      ],
      'YARA',
    )
    expect(msg).toContain('Cidade / retirada: Ituverava')
    expect(msg).toContain('Faturamento: Faturar p/Ituverava - SP')
    expect(msg).toContain('Tipo de entrega: CIF')
    expect(msg).toContain('Data de vencimento: 30/10/2026')
    expect(msg).toMatch(/Frete: R\$\s*0,00/)
    expect(msg).toMatch(/R\$: R\$\s*550,00/)
    expect(msg).toMatch(/Total da OC: \*R\$\s*2\.250,00\*/)
  })

  it('mostra vencimento por produto quando as datas divergem', () => {
    const msg = formatOcMensagem(
      { numero: 'OC-5', filial_site: 'uberaba', data_documento: '2026-09-01' },
      [
        { product: { displayNome: 'A' }, volume_kg: 1000, pagamento_syagri: '2026-10-30' },
        { product: { displayNome: 'B' }, volume_kg: 1000, pagamento_syagri: '2026-11-30' },
      ],
      'YARA',
    )
    expect(msg).not.toContain('Data de vencimento')
    expect(msg).toContain('Vencimento: 30/10/2026')
    expect(msg).toContain('Vencimento: 30/11/2026')
  })
})
