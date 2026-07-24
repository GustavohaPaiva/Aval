import { describe, expect, it } from 'vitest'
import {
  analyzeSpreadsheet,
  autoMapColumns,
  dateToQuarter,
  detectFornecedor,
  detectHeaderRow,
  detectQuarterText,
  extractCurrencyCandidates,
  extractDateCandidates,
  filterDataRows,
  findEmbalagemColumnIndex,
  isEmbalagem1000Kg,
  normalizeEmbalagemLabel,
  parsePrecoValue,
} from './spreadsheetAnalyzer'
describe('spreadsheetAnalyzer', () => {
  it('detecta cabeçalho na linha 8 com blocos de título', () => {
    const matrix = [
      ['LISTA DE PREÇOS - FORNECEDOR X'],
      [''],
      ['', '', 'Válido até 30/06/2026'],
      ['', '', '', '', '', 'Moeda: USD'],
      [''],
      [''],
      [''],
      ['Produto', 'Descrição', 'Ref. Complementar', 'Preço de Custo'],
      ['Herbicida A', 'Descrição A', 'REF-001', '12,50'],
      ['Herbicida B', 'Descrição B', 'REF-002', '25,00'],
    ]

    const { headerRowIndex, confidence } = detectHeaderRow(matrix)
    expect(headerRowIndex).toBe(7)
    expect(['high', 'medium']).toContain(confidence)
  })

  it('extrai moeda e validade de células dispersas', () => {
    const matrix = [
      ['', '', 'Válido até 30/06/2026'],
      ['', '', '', '', '', 'USD'],
      ['Produto', 'Descrição', 'Referência', 'Custo'],
      ['Item', 'Desc', 'R1', '10'],
    ]

    const moeda = extractCurrencyCandidates(matrix, 2)
    const dates = extractDateCandidates(matrix, 2)

    expect(moeda[0]?.value).toBe('USD')
    expect(dates[0]?.value).toBeInstanceOf(Date)
    expect(dateToQuarter(dates[0].value)).toBe('Q2 2026')
  })

  it('analisa planilha completa com metadados', () => {
    const matrix = [
      ['Tabela de preços'],
      ['Validade: jun/2026', '', '', 'R$'],
      ['Produto', 'Descrição', 'Ref.', 'Valor'],
      ['Prod X', 'Desc X', 'ABC', '100,00'],
      ['TOTAL', '', '', '100,00'],
    ]

    const result = analyzeSpreadsheet(matrix)
    expect(result.ok).toBe(true)
    expect(result.columns).toHaveLength(4)
    expect(result.dataRows).toHaveLength(1)
    expect(result.moedaDetectada).toBe('USD')
    expect(result.quarterCalculado).toBe('Q2 2026')
  })

  it('regressão: cabeçalho na linha 1', () => {
    const matrix = [
      ['Produto', 'Descrição', 'Referência complementar', 'Preço de custo'],
      ['P1', 'D1', 'R1', '10,00'],
      ['P2', 'D2', 'R2', '20,00'],
    ]

    const result = analyzeSpreadsheet(matrix)
    expect(result.ok).toBe(true)
    expect(result.headerRowIndex).toBe(0)
    expect(result.dataRows).toHaveLength(2)
    expect(result.headerConfidence).toBe('high')
  })

  it('filtra linhas sem fertilizante ou preço', () => {
    const matrix = [
      ['Produto', 'Ref', 'Custo'],
      ['Item ok', 'REF1', '10,00'],
      ['', 'REF2', '5,00'],
      ['Sem preço', 'Fert X', ''],
      ['OBS: preços sujeitos a alteração'],
    ]

    const rows = filterDataRows(matrix, 0, {
      produtoIndex: 0,
      precoIndex: 2,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0][0]).toBe('Item ok')
  })

  it('detecta quarter por texto QX na planilha', () => {
    const matrix = [
      ['Lista de preços Q3 2026'],
      ['Produto', 'Ref', 'Custo'],
      ['Ureia', 'R1', '10'],
    ]

    const candidates = detectQuarterText(matrix)
    expect(candidates[0]?.value).toBe('Q3 2026')
  })

  it('usa quarter textual com prioridade sobre data', () => {
    const matrix = [
      ['Quarter: Q1 2026', '', 'Validade 30/06/2026'],
      ['Produto', 'Ref', 'Custo'],
      ['Ureia', 'R1', '10'],
    ]

    const result = analyzeSpreadsheet(matrix)
    expect(result.ok).toBe(true)
    expect(result.quarterCalculado).toBe('Q1 2026')
  })

  it('aplica validade padrão 31/12 do ano corrente quando não detectada', () => {
    const matrix = [
      ['Produto', 'Ref', 'Custo'],
      ['Ureia', 'R1', '10'],
    ]

    const year = new Date().getFullYear()
    const result = analyzeSpreadsheet(matrix)
    expect(result.ok).toBe(true)
    expect(result.dataValidade).toBe(`${year}-12-31`)
    expect(result.quarterCalculado).toBe(`Q4 ${year}`)
    expect(result.metadataPlanilha.validadeDefaultAplicada).toBe(true)
  })

  it('parsePrecoValue aceita formato brasileiro', () => {
    expect(parsePrecoValue('1.234,56')).toBe(1234.56)
    expect(parsePrecoValue('12,5')).toBe(12.5)
    expect(parsePrecoValue('abc')).toBeNull()
  })

  it('parsePrecoValue aceita formato americano e número do Excel', () => {
    expect(parsePrecoValue('45.50')).toBe(45.5)
    expect(parsePrecoValue('1,234.56')).toBe(1234.56)
    expect(parsePrecoValue(45.5)).toBe(45.5)
  })

  it('parsePrecoValue rejeita valores acima do limite do banco', () => {
    expect(parsePrecoValue('1234567890123')).toBeNull()
    expect(parsePrecoValue(1e15)).toBeNull()
  })

  it('autoMapColumns mapeia layout YARA UBA (Descrição, Referência, Revenda/Custo)', () => {
    const matrix = [
      ['LISTA DE PREÇOS - YARA BRASIL S/A', 'Dólar'],
      ['5.03'],
      ['Codigo Lista', 'Nome de Lista', 'Local de Expedição', 'Vencimento'],
      ['26054A26Q2', '26Q2_SUDESTE', 'UBA4', '46202'],
      [],
      [],
      ['Produto', 'Grupo de Família', 'Descrição', 'Referência Complementar', 'Característica', 'Embalagem', 'Revenda', 'Custo R$ FOB'],
      ['1000003242', 'Blends', '08 30 10', 'C/FMS', 'MISTURA', '1000KG', '795.49', '4001.32'],
      ['1000003217', 'Blends', '08 28 16', 'C/FMS', 'MISTURA', '1000KG', '800.42', '4026.14'],
    ]

    const { headerRowIndex } = detectHeaderRow(matrix)
    const autoMap = autoMapColumns(matrix, headerRowIndex)

    const byTarget = Object.fromEntries(
      autoMap.mappings.filter((m) => m.target !== '__ignore__').map((m) => [m.target, m.sourceLabel]),
    )

    expect(byTarget.produto).toMatch(/descri/i)
    expect(byTarget.codigo_produto).toMatch(/^produto$/i)
    expect(byTarget.referencia_complementar).toMatch(/refer/i)
    // Deve preferir Revenda (USD), não "Custo R$ FOB" (já em BRL).
    expect(byTarget.preco_custo).toMatch(/revenda/i)
    expect(autoMap.missingRequired).toHaveLength(0)
    expect(['high', 'medium']).toContain(autoMap.confidence.produto)
    expect(['high', 'medium']).toContain(autoMap.confidence.preco_custo)
  })

  it('autoMapColumns mapeia layout YARA CBT (sem coluna Custo, usa Revenda)', () => {
    const matrix = [
      ['LISTA DE PREÇOS - YARA BRASIL S/A'],
      ['Codigo Lista', 'Nome de Lista', 'Local de Expedição', 'Vencimento'],
      ['26054A26Q3', '26Q3_SUDESTE', 'CBT3', '46230'],
      ['PREÇO MÍNIMO (FOB à vista sem impostos) USD'],
      ['Knowledge grows'],
      ['Produto', 'Grupo de Família', 'Descrição', 'Referência Complementar', 'Característica', 'Embalagem', 'Revenda'],
      ['1000003220', 'Blends', '08 28 16', '2Ca 3S', 'MISTURA', '1000KG', '781.74'],
    ]

    const { headerRowIndex } = detectHeaderRow(matrix)
    const autoMap = autoMapColumns(matrix, headerRowIndex)

    const precoCol = autoMap.mappings.find((m) => m.target === 'preco_custo')
    expect(precoCol?.sourceLabel).toMatch(/revenda/i)
    expect(autoMap.missingRequired).toHaveLength(0)
  })

  it('detectFornecedor identifica YARA pelo nome do arquivo e título', () => {
    const matrix = [
      ['LISTA DE PREÇOS - YARA BRASIL S/A'],
      ['Produto', 'Descrição', 'Ref', 'Custo'],
    ]

    const fromFile = detectFornecedor({
      fileName: 'Lista_fertilizante_YARA_UBA_Q2_25_05_26.xlsx',
      matrix,
    })
    expect(fromFile.fornecedorNome).toBe('YARA')
    expect(['high', 'medium']).toContain(fromFile.confidence)
  })

  it('analyzeSpreadsheet inclui autoMappings', () => {
    const matrix = [
      ['Produto', 'Descrição', 'Referência complementar', 'Preço de custo'],
      ['P1', 'D1', 'R1', '10,00'],
    ]

    const result = analyzeSpreadsheet(matrix)
    expect(result.ok).toBe(true)
    expect(result.autoMappings?.length).toBeGreaterThan(0)
    expect(result.autoMapConfidence?.produto).toBeTruthy()
    expect(result.moedaDetectada).toBe('USD')
  })

  it('isEmbalagem1000Kg aceita apenas label literal 1000KG', () => {
    expect(isEmbalagem1000Kg('1000KG')).toBe(true)
    expect(isEmbalagem1000Kg('1000 KG')).toBe(true)
    expect(isEmbalagem1000Kg('Pallet 1000KG (Saco 25KG)')).toBe(false)
    expect(isEmbalagem1000Kg('Pallet 2000KG (Saco 50KG)')).toBe(false)
    expect(isEmbalagem1000Kg('25KG')).toBe(false)
  })

  it('filterDataRows exclui embalagens diferentes de 1000KG', () => {
    const matrix = [
      ['Produto', 'Descrição', 'Embalagem', 'Preço'],
      ['1', 'Prod A', '1000KG', '10'],
      ['2', 'Prod B', 'Pallet 2000KG (Saco 50KG)', '20'],
      ['3', 'Prod C', '25KG', '5'],
    ]

    const rows = filterDataRows(matrix, 0, {
      produtoIndex: 1,
      precoIndex: 3,
      embalagemIndex: 2,
    })

    expect(rows).toHaveLength(1)
    expect(normalizeEmbalagemLabel(rows[0][2])).toBe('1000kg')
  })

  it('analyzeSpreadsheet YARA CBT importa só linhas 1000KG', async () => {
    const { readFileSync } = await import('fs')
    const { parseSpreadsheetFile } = await import('./spreadsheetParser')
    const buffer = readFileSync(
      './Planilhas de Fornecedores/2.1 Lista_fertilizante_YARA_CBT_Q2_25_05_26.xlsx',
    )
    const file = {
      name: 'cbt.xlsx',
      arrayBuffer: async () =>
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ),
    }

    const parsed = await parseSpreadsheetFile(file)
    expect(parsed.ok).toBe(true)
    expect(parsed.dataRows.length).toBeLessThan(60)
    expect(parsed.dataRows.length).toBeGreaterThan(0)

    const embIdx = findEmbalagemColumnIndex(parsed.matrix, parsed.headerRowIndex)
    expect(embIdx).toBeDefined()
    for (const row of parsed.dataRows) {
      expect(isEmbalagem1000Kg(row[embIdx])).toBe(true)
    }
  })
})
