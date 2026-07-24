import { FRETE_ORIGEM_VALUES } from '../constants/fretes'
import { normalizeFreteLocation } from './normalizeFrete'
import { cellToString, parsePrecoValue } from './spreadsheetAnalyzer'

const ORIGEM_HEADER_PATTERNS = [
  /^origem$/,
  /^cidade\s*(de\s*)?origem$/,
  /^origin$/,
  /^from$/,
]

const DESTINO_HEADER_PATTERNS = [
  /^destino$/,
  /^cidade\s*(de\s*)?destino$/,
  /^destination$/,
  /^to$/,
]

const VALOR_HEADER_PATTERNS = [
  /^valor$/,
  /^valor\s*(do\s*)?frete$/,
  /^pre[cç]o$/,
  /^price$/,
  /^frete$/,
]

function normalizeHeaderLabel(value) {
  return cellToString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripAccents(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function matchHeaderPatterns(label, patterns) {
  return patterns.some((pattern) => pattern.test(label))
}

function scoreHeaderRow(row) {
  const labels = (row ?? []).map(normalizeHeaderLabel)
  let score = 0
  let origemIndex = -1
  let destinoIndex = -1
  let valorIndex = -1

  labels.forEach((label, index) => {
    if (!label) return
    if (origemIndex < 0 && matchHeaderPatterns(label, ORIGEM_HEADER_PATTERNS)) {
      origemIndex = index
      score += 10
      return
    }
    if (destinoIndex < 0 && matchHeaderPatterns(label, DESTINO_HEADER_PATTERNS)) {
      destinoIndex = index
      score += 10
      return
    }
    if (valorIndex < 0 && matchHeaderPatterns(label, VALOR_HEADER_PATTERNS)) {
      valorIndex = index
      score += 10
    }
  })

  return { score, origemIndex, destinoIndex, valorIndex }
}

function detectFreteColumns(matrix) {
  let best = null

  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 20); rowIndex += 1) {
    const candidate = scoreHeaderRow(matrix[rowIndex])
    if (candidate.origemIndex < 0 || candidate.destinoIndex < 0 || candidate.valorIndex < 0) {
      continue
    }
    if (!best || candidate.score > best.score) {
      best = { ...candidate, headerRowIndex: rowIndex }
    }
  }

  if (best) return best

  // Fallback: planilha sem cabeçalho reconhecível — assume ordem origem | destino | valor
  const firstDataRow = matrix.find((row) =>
    (row ?? []).some((cell) => cellToString(cell).length > 0),
  )
  if (firstDataRow && firstDataRow.length >= 3) {
    return {
      score: 1,
      headerRowIndex: -1,
      origemIndex: 0,
      destinoIndex: 1,
      valorIndex: 2,
    }
  }

  return null
}

function isBlankRow(row) {
  return !(row ?? []).some((cell) => cellToString(cell).length > 0)
}

/**
 * Normaliza localidade da planilha (maiúsculas, sem acentos).
 */
export function normalizeFreteImportLocation(value) {
  return stripAccents(normalizeFreteLocation(value))
}

/**
 * Resolve origem da planilha para um valor canônico do catálogo.
 * Aceita variações de acento (ex.: Cubatão → CUBATAO).
 */
export function resolveFreteOrigem(raw) {
  const normalized = normalizeFreteImportLocation(raw)
  if (!normalized) return null
  if (FRETE_ORIGEM_VALUES.includes(normalized)) return normalized

  return (
    FRETE_ORIGEM_VALUES.find(
      (value) => normalizeFreteImportLocation(value) === normalized,
    ) ?? null
  )
}

/**
 * Valida uma linha já mapeada da planilha.
 * @returns {{ ok: true, row } | { ok: false, error: string }}
 */
export function validateFreteImportRow({ origemRaw, destinoRaw, valorRaw, rowNumber }) {
  const destino = normalizeFreteImportLocation(destinoRaw)
  const origem = resolveFreteOrigem(origemRaw)
  const valor = parsePrecoValue(valorRaw)

  if (!cellToString(origemRaw) && !cellToString(destinoRaw) && !cellToString(valorRaw)) {
    return { ok: false, error: 'Linha vazia.', skip: true }
  }

  if (!cellToString(origemRaw)) {
    return {
      ok: false,
      error: 'Cidade de origem não informada.',
      rowNumber,
      origemRaw,
      destinoRaw,
      valorRaw,
    }
  }

  if (!origem) {
    return {
      ok: false,
      error: `Cidade de origem não reconhecida: "${cellToString(origemRaw)}". Use Uberaba, Cubatão ou Rio Grande.`,
      rowNumber,
      origemRaw: cellToString(origemRaw),
      destinoRaw: cellToString(destinoRaw),
      valorRaw: cellToString(valorRaw),
    }
  }

  if (!destino) {
    return {
      ok: false,
      error: 'Cidade de destino não informada.',
      rowNumber,
      origemRaw: cellToString(origemRaw),
      destinoRaw: cellToString(destinoRaw),
      valorRaw: cellToString(valorRaw),
    }
  }

  if (valor == null) {
    return {
      ok: false,
      error: `Valor não numérico: "${cellToString(valorRaw)}".`,
      rowNumber,
      origemRaw: cellToString(origemRaw),
      destinoRaw: cellToString(destinoRaw),
      valorRaw: cellToString(valorRaw),
    }
  }

  return {
    ok: true,
    row: {
      rowNumber,
      origem,
      destino,
      valor,
      origemRaw: cellToString(origemRaw),
      destinoRaw: cellToString(destinoRaw),
      valorRaw: cellToString(valorRaw),
    },
  }
}

/**
 * Analisa a matriz da planilha e separa linhas válidas / inválidas.
 */
export function analyzeFreteSpreadsheet(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { ok: false, error: 'Nenhuma linha encontrada na planilha.' }
  }

  const columns = detectFreteColumns(matrix)
  if (!columns) {
    return {
      ok: false,
      error:
        'Não foi possível identificar as colunas. Esperado: origem, destino e valor.',
    }
  }

  const dataStart =
    columns.headerRowIndex >= 0 ? columns.headerRowIndex + 1 : 0
  const validRows = []
  const invalidRows = []
  const seenKeys = new Map()

  for (let i = dataStart; i < matrix.length; i += 1) {
    const row = matrix[i] ?? []
    if (isBlankRow(row)) continue

    const rowNumber = i + 1
    const result = validateFreteImportRow({
      origemRaw: row[columns.origemIndex],
      destinoRaw: row[columns.destinoIndex],
      valorRaw: row[columns.valorIndex],
      rowNumber,
    })

    if (result.skip) continue

    if (!result.ok) {
      invalidRows.push({
        rowNumber,
        error: result.error,
        origemRaw: result.origemRaw ?? cellToString(row[columns.origemIndex]),
        destinoRaw: result.destinoRaw ?? cellToString(row[columns.destinoIndex]),
        valorRaw: result.valorRaw ?? cellToString(row[columns.valorIndex]),
      })
      continue
    }

    const key = `${result.row.origem}||${result.row.destino}`
    const previous = seenKeys.get(key)
    if (previous != null) {
      // Mantém a última ocorrência; marca a anterior como sobrescrita na planilha
      const removed = validRows.findIndex(
        (item) => item.origem === result.row.origem && item.destino === result.row.destino,
      )
      if (removed >= 0) validRows.splice(removed, 1)
    }
    seenKeys.set(key, rowNumber)
    validRows.push(result.row)
  }

  if (validRows.length === 0 && invalidRows.length === 0) {
    return { ok: false, error: 'A planilha não contém linhas de frete.' }
  }

  return {
    ok: true,
    headerRowIndex: columns.headerRowIndex,
    columnIndexes: {
      origem: columns.origemIndex,
      destino: columns.destinoIndex,
      valor: columns.valorIndex,
    },
    validRows,
    invalidRows,
    totalRows: validRows.length + invalidRows.length,
  }
}

/**
 * Lê um arquivo .xlsx/.xls/.csv e analisa as linhas de frete.
 */
export async function parseFreteSpreadsheetFile(file) {
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

  const analysis = analyzeFreteSpreadsheet(matrix)
  if (!analysis.ok) return analysis

  return {
    ...analysis,
    sheetName,
    fileName: file?.name ?? '',
  }
}
