import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { classificarFinanceiro, comissaoLiberadaPorQuitacao } from './financeiroSituacao'
import {
  COMISSAO_EXPORT_HEADERS,
  dataVencimentoPedido,
  dataVendaPedido,
  linhasExportacaoComissao,
  situacaoPagamentoPedido,
  workbookComissoes,
} from './comissaoExport'

const HOJE = '2026-11-19'

function registro(partial) {
  return {
    id: 'reg-1',
    simulation_id: 'sim-1',
    consultor_nome: 'Ana',
    margem_media_percentual: 9.5,
    simulations: {
      data_negociacao: '2026-11-01',
      data_pagamento: '2026-12-01',
      created_at: '2026-11-01T15:00:00Z',
      clients: { nome: 'Fazenda Sul' },
    },
    ...partial,
  }
}

function item(partial) {
  return {
    id: 'item-1',
    comissao_registro_id: 'reg-1',
    simulation_item_id: 'line-1',
    produto_nome: 'MAP',
    base_calculo: 10000,
    margem_percentual: 5,
    comissao_percentual: 0.5,
    comissao_valor: 50,
    ...partial,
  }
}

function financeiro(partial) {
  return classificarFinanceiro({
    valorDevido: 1000,
    valorRecebido: 0,
    vencimento: '2026-12-01',
    hoje: HOJE,
    ...partial,
  })
}

describe('situação de pagamento da comissão', () => {
  it('marca não pago sem recebimento e em pagamento parcial', () => {
    expect(situacaoPagamentoPedido(financeiro({ valorRecebido: 0 }))).toBe('Não pago')
    expect(situacaoPagamentoPedido(financeiro({ valorRecebido: 400 }))).toBe('Não pago')
    expect(situacaoPagamentoPedido(null)).toBe('Não pago')
  })

  it('marca pago só com quitação integral e volta a não pago depois do estorno', () => {
    const quitado = financeiro({ valorRecebido: 1000 })
    expect(quitado.quitado).toBe(true)
    expect(situacaoPagamentoPedido(quitado)).toBe('Pago')

    const estornado = financeiro({ valorRecebido: 0 })
    expect(situacaoPagamentoPedido(estornado)).toBe('Não pago')
  })

  it('trata pedido de valor zero quitado como não pago, igual à tela', () => {
    const zerado = financeiro({ valorDevido: 0, valorRecebido: 0, vencimento: null })
    expect(zerado.quitado).toBe(true)
    expect(zerado.comissaoLiberada).toBe(false)
    expect(comissaoLiberadaPorQuitacao(zerado)).toBe(false)
    expect(situacaoPagamentoPedido(zerado)).toBe('Não pago')
  })
})

describe('datas da exportação', () => {
  it('usa a data de negociação e, sem ela, o dia em São Paulo', () => {
    expect(dataVendaPedido(registro({}))).toBe('2026-11-01')
    expect(
      dataVendaPedido(
        registro({
          simulations: {
            data_negociacao: '2026-08-04',
            created_at: '2026-11-19T18:00:00Z',
            data_pagamento: '2026-12-01',
            clients: { nome: 'Fazenda Sul' },
          },
        }),
      ),
    ).toBe('2026-08-04')
    expect(
      dataVendaPedido(
        registro({
          simulations: {
            data_negociacao: null,
            created_at: '2026-01-01T02:30:00Z',
            clients: { nome: 'Fazenda Sul' },
          },
        }),
      ),
    ).toBe('2025-12-31')
  })

  it('usa o vencimento vigente da renegociação', () => {
    const row = registro({})
    expect(dataVencimentoPedido(row, { vencimento: '2027-03-15', quitado: false, saldo: 100 })).toBe(
      '2027-03-15',
    )
    expect(dataVencimentoPedido(row, null)).toBe('2026-12-01')
  })
})

describe('linhas por produto', () => {
  const itens = [
    item({
      id: 'item-a',
      simulation_item_id: 'line-a',
      produto_nome: 'MAP',
      base_calculo: 8000,
      margem_percentual: 4.25,
      comissao_percentual: 0.4,
      comissao_valor: 32,
    }),
    item({
      id: 'item-b',
      simulation_item_id: 'line-b',
      produto_nome: 'KCl',
      base_calculo: 2000,
      margem_percentual: 7,
      comissao_percentual: 1.5,
      comissao_valor: 30,
    }),
  ]

  it('mantém a margem e a comissão de cada produto, inclusive sem quitação', () => {
    const linhas = linhasExportacaoComissao({
      registros: [registro({})],
      itens,
      financeiroById: { 'sim-1': financeiro({ valorRecebido: 250 }) },
    })

    expect(linhas).toHaveLength(2)
    expect(linhas.map((linha) => linha.margemPercentual)).toEqual([4.25, 7])
    expect(linhas.every((linha) => linha.margemPercentual !== 9.5)).toBe(true)
    expect(linhas.map((linha) => linha.comissaoPercentual)).toEqual([0.4, 1.5])
    expect(linhas.map((linha) => linha.comissaoValor)).toEqual([32, 30])
    expect(linhas.map((linha) => linha.valorTotal)).toEqual([8000, 2000])
    expect(linhas.every((linha) => linha.situacaoPagamento === 'Não pago')).toBe(true)
  })

  it('repete a mesma situação em todos os produtos do pedido quitado', () => {
    const linhas = linhasExportacaoComissao({
      registros: [registro({})],
      itens,
      financeiroById: {
        'sim-1': { ...financeiro({ valorRecebido: 1000 }), vencimento: '2027-01-20' },
      },
    })

    expect(linhas.every((linha) => linha.situacaoPagamento === 'Pago')).toBe(true)
    expect(linhas.every((linha) => linha.dataVencimento === '2027-01-20')).toBe(true)
    expect(linhas.map((linha) => linha.comissaoValor)).toEqual([32, 30])
  })

  it('separa pedidos e consultores e ignora item repetido', () => {
    const linhas = linhasExportacaoComissao({
      registros: [
        registro({ id: 'reg-1', simulation_id: 'sim-1', consultor_nome: 'Ana' }),
        registro({
          id: 'reg-2',
          simulation_id: 'sim-2',
          consultor_nome: 'Bruno',
          simulations: {
            data_negociacao: '2026-10-02',
            data_pagamento: '2026-11-02',
            clients: { nome: 'Fazenda Norte' },
          },
        }),
      ],
      itens: [
        item({ id: 'a1', comissao_registro_id: 'reg-1', simulation_item_id: 'l1' }),
        item({ id: 'a1-dup', comissao_registro_id: 'reg-1', simulation_item_id: 'l1', comissao_valor: 999 }),
        item({
          id: 'b1',
          comissao_registro_id: 'reg-2',
          simulation_item_id: 'l9',
          produto_nome: 'Ureia',
          base_calculo: 500,
          margem_percentual: 3,
          comissao_percentual: 0.3,
          comissao_valor: 1.5,
        }),
      ],
      financeiroById: {
        'sim-1': financeiro({ valorRecebido: 1000 }),
        'sim-2': financeiro({ valorDevido: 500, valorRecebido: 0 }),
      },
    })

    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toMatchObject({
      consultor: 'Ana',
      cliente: 'Fazenda Sul',
      situacaoPagamento: 'Pago',
      comissaoValor: 50,
    })
    expect(linhas[1]).toMatchObject({
      consultor: 'Bruno',
      cliente: 'Fazenda Norte',
      produto: 'Ureia',
      dataVenda: '2026-10-02',
      situacaoPagamento: 'Não pago',
      comissaoValor: 1.5,
    })
  })

  it('exporta valor zero quitado como não pago e mantém a data da venda gravada', () => {
    const linhas = linhasExportacaoComissao({
      registros: [
        registro({
          simulations: {
            data_negociacao: '2026-08-04',
            created_at: '2026-11-19T18:00:00Z',
            data_pagamento: '2026-12-01',
            clients: { nome: 'Fazenda Sul' },
          },
        }),
      ],
      itens: [item({ comissao_valor: 12 })],
      financeiroById: {
        'sim-1': financeiro({ valorDevido: 0, valorRecebido: 0, vencimento: null }),
      },
    })

    expect(linhas).toHaveLength(1)
    expect(linhas[0].situacaoPagamento).toBe('Não pago')
    expect(linhas[0].comissaoValor).toBe(12)
    expect(linhas[0].dataVenda).toBe('2026-08-04')
  })

  it('deixa a margem em branco quando o produto não tem snapshot individual', () => {
    const linhas = linhasExportacaoComissao({
      registros: [registro({})],
      itens: [item({ margem_percentual: null })],
      financeiroById: { 'sim-1': financeiro({ valorRecebido: 0 }) },
    })
    expect(linhas[0].margemPercentual).toBeNull()
    expect(linhas[0].comissaoValor).toBe(50)
  })
})

describe('planilha de comissões', () => {
  it('grava cabeçalho, formatos, filtro e uma linha por produto', () => {
    const linhas = linhasExportacaoComissao({
      registros: [registro({})],
      itens: [
        item({
          id: 'item-a',
          simulation_item_id: 'line-a',
          produto_nome: 'MAP',
          base_calculo: 8000.5,
          margem_percentual: 4.25,
          comissao_percentual: 0.4,
          comissao_valor: 32,
        }),
        item({
          id: 'item-b',
          simulation_item_id: 'line-b',
          produto_nome: 'KCl',
          margem_percentual: 7,
          comissao_percentual: 1.25,
          comissao_valor: 30.5,
          base_calculo: 2440,
        }),
      ],
      financeiroById: {
        'sim-1': { ...financeiro({ valorRecebido: 1000 }), vencimento: '2027-03-15' },
      },
    })

    const book = workbookComissoes(XLSX, linhas)
    const buffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' })
    const read = XLSX.read(buffer, { type: 'array', cellNF: true, cellDates: true, cellStyles: true })
    const sheet = read.Sheets.Comissões

    expect(read.SheetNames).toEqual(['Comissões'])
    expect(sheet['!autofilter']?.ref).toBe('A1:J3')
    expect(sheet['!cols']?.map((col) => col.wch)).toEqual([16, 32, 28, 32, 36, 28, 34, 16, 18, 24])
    expect(COMISSAO_EXPORT_HEADERS.map((_, index) => sheet[XLSX.utils.encode_cell({ r: 0, c: index })].v)).toEqual(
      COMISSAO_EXPORT_HEADERS,
    )

    expect(sheet.A2.w).toBe('01/11/2026')
    expect(sheet.A2.z).toBe('dd/mm/yyyy')
    expect(sheet.B2.w).toBe('15/03/2027')
    expect(sheet.B2.z).toBe('dd/mm/yyyy')

    expect(sheet.F2.v).toBe(8000.5)
    expect(sheet.F2.z).toBe('"R$"#,##0.00')
    expect(sheet.G2.v).toBeCloseTo(0.0425, 6)
    expect(sheet.G2.z).toBe('0.00%')
    expect(sheet.H2.v).toBeCloseTo(0.004, 6)
    expect(sheet.H2.z).toBe('0.00%')
    expect(sheet.I2.v).toBe(32)
    expect(sheet.I2.z).toBe('"R$"#,##0.00')
    expect(sheet.J2.v).toBe('Pago')
    expect(sheet.E3.v).toBe('KCl')
    expect(sheet.H3.v).toBeCloseTo(0.0125, 6)
    expect(sheet.J3.v).toBe('Pago')
    expect(sheet.A4).toBeUndefined()
  })
})
