import { describe, expect, it } from 'vitest'
import {
  analyzeFreteSpreadsheet,
  resolveFreteOrigem,
  validateFreteImportRow,
} from './freteSpreadsheet'

describe('freteSpreadsheet', () => {
  it('resolve origem com acentos e espaços', () => {
    expect(resolveFreteOrigem('Cubatão')).toBe('CUBATAO')
    expect(resolveFreteOrigem('  rio   grande  ')).toBe('RIO GRANDE')
    expect(resolveFreteOrigem('Uberaba')).toBe('UBERABA')
    expect(resolveFreteOrigem('São Paulo')).toBeNull()
  })

  it('valida linha com valor BR e rejeita valor inválido', () => {
    const ok = validateFreteImportRow({
      origemRaw: 'UBERABA',
      destinoRaw: 'Uberlândia',
      valorRaw: '133,50',
      rowNumber: 2,
    })
    expect(ok.ok).toBe(true)
    expect(ok.row).toMatchObject({
      origem: 'UBERABA',
      destino: 'UBERLANDIA',
      valor: 133.5,
      rowNumber: 2,
    })

    const bad = validateFreteImportRow({
      origemRaw: 'UBERABA',
      destinoRaw: 'Uberlândia',
      valorRaw: 'abc',
      rowNumber: 3,
    })
    expect(bad.ok).toBe(false)
    expect(bad.error).toMatch(/Valor não numérico/)
  })

  it('sinaliza origem não reconhecida sem travar demais linhas', () => {
    const matrix = [
      ['Origem', 'Destino', 'Valor'],
      ['UBERABA', 'ABADIA DOURADOS', 133],
      ['SAO PAULO', 'CAMPINAS', 90],
      ['CUBATAO', 'ADAMANTINA', '182,00'],
      ['UBERABA', 'ABAETE', 'x'],
    ]

    const result = analyzeFreteSpreadsheet(matrix)
    expect(result.ok).toBe(true)
    expect(result.validRows).toHaveLength(2)
    expect(result.invalidRows).toHaveLength(2)
    expect(result.invalidRows[0].error).toMatch(/não reconhecida/)
    expect(result.invalidRows[1].error).toMatch(/não numérico/)
    expect(result.validRows.map((r) => r.destino)).toEqual([
      'ABADIA DOURADOS',
      'ADAMANTINA',
    ])
  })

  it('detecta cabeçalhos alternativos e deduplica pela última ocorrência', () => {
    const matrix = [
      ['Cidade de origem', 'Cidade de destino', 'Valor frete'],
      ['Uberaba', 'Abaete', 100],
      ['Uberaba', 'Abaete', 219],
    ]

    const result = analyzeFreteSpreadsheet(matrix)
    expect(result.ok).toBe(true)
    expect(result.validRows).toHaveLength(1)
    expect(result.validRows[0]).toMatchObject({
      origem: 'UBERABA',
      destino: 'ABAETE',
      valor: 219,
      rowNumber: 3,
    })
  })

  it('aceita planilha sem cabeçalho na ordem origem/destino/valor', () => {
    const matrix = [
      ['CUBATAO', 'AGUDOS', 160],
      ['RIO GRANDE', 'PELOTAS', 85.5],
    ]

    const result = analyzeFreteSpreadsheet(matrix)
    expect(result.ok).toBe(true)
    expect(result.headerRowIndex).toBe(-1)
    expect(result.validRows).toHaveLength(2)
    expect(result.validRows[1].origem).toBe('RIO GRANDE')
  })
})
