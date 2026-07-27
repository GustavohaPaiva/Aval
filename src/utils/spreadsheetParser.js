/**
 * Lê a primeira planilha e analisa estrutura (cabeçalho, metadados, dados).
 */
import {
  analyzeSpreadsheet,
  autoMapColumns,
  buildColumnsFromHeader,
  detectFornecedor,
  filterDataRows,
  findCatalogColumnIndex,
  findEmbalagemColumnIndex,
  groupDataRowsByQuarter,
} from './spreadsheetAnalyzer'

export async function parseSpreadsheetFile(file, options = {}) {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', raw: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { ok: false, error: 'A planilha está vazia.' }
  }

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })

  if (!matrix.length) {
    return { ok: false, error: 'Nenhuma linha encontrada na planilha.' }
  }

  const fileName = file?.name ?? options.fileName ?? ''
  const fornecedorDetectado = detectFornecedor({ fileName, matrix })

  const headerRowIndex =
    options.headerRowIndex !== undefined
      ? options.headerRowIndex
      : undefined

  let analysis
  if (headerRowIndex !== undefined) {
    const columns = buildColumnsFromHeader(matrix, headerRowIndex)
    if (columns.length === 0) {
      return {
        ok: false,
        error: 'Não foi possível identificar colunas na linha selecionada.',
      }
    }
    const base = analyzeSpreadsheet(matrix)
    const autoMap =
      options.columnMappings?.length > 0
        ? {
            mappings: options.columnMappings,
            confidence: options.autoMapConfidence ?? {},
            missingRequired: [],
          }
        : autoMapColumns(matrix, headerRowIndex)

    const produtoIdx = autoMap.mappings.find((m) => m.target === 'produto')?.sourceIndex
    const precoIdx = autoMap.mappings.find((m) => m.target === 'preco_custo')?.sourceIndex
    const referenciaIdx = autoMap.mappings.find(
      (m) => m.target === 'referencia_complementar',
    )?.sourceIndex
    const embalagemIdx = findEmbalagemColumnIndex(matrix, headerRowIndex)
    const dataRows = filterDataRows(matrix, headerRowIndex, {
      produtoIndex: produtoIdx,
      referenciaIndex: referenciaIdx,
      precoIndex: precoIdx,
      embalagemIndex: embalagemIdx,
    })
    const dataValidade = options.dataValidade ?? base.dataValidade ?? ''
    const quarterCalculado =
      options.quarterCalculado ?? base.quarterCalculado ?? ''
    const catalogIndex = findCatalogColumnIndex(matrix, headerRowIndex)
    const quarterGroups = groupDataRowsByQuarter(dataRows, {
      catalogIndex,
      matrix,
      headerRowIndex,
      fallbackQuarter: quarterCalculado,
      fallbackValidade: dataValidade,
    })

    analysis = {
      ok: true,
      headerRowIndex,
      headerConfidence: 'manual',
      headerScore: null,
      columns,
      dataRows,
      quarterGroups,
      catalogColumnIndex: catalogIndex,
      moedaDetectada: 'USD',
      dataValidade,
      quarterCalculado,
      autoMappings: autoMap.mappings,
      autoMapConfidence: autoMap.confidence,
      autoMapMissingRequired: autoMap.missingRequired,
      fornecedorDetectado,
      metadataPlanilha: {
        ...(base.metadataPlanilha ?? {}),
        headerRowIndex,
        headerConfidence: 'manual',
        autoMapConfidence: autoMap.confidence,
        autoMapMissingRequired: autoMap.missingRequired,
        fornecedorDetectado,
        catalogColumnIndex: catalogIndex,
        quarterGroupCount: quarterGroups.length,
      },
    }
  } else {
    analysis = analyzeSpreadsheet(matrix)
    if (!analysis.ok) return analysis
    analysis = {
      ...analysis,
      fornecedorDetectado,
      metadataPlanilha: {
        ...analysis.metadataPlanilha,
        fornecedorDetectado,
      },
    }
  }

  return {
    ok: true,
    sheetName,
    matrix,
    fileName,
    ...analysis,
    headerCells: matrix[analysis.headerRowIndex] ?? [],
  }
}
