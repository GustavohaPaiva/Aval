/**
 * Análise estrutural de planilhas de fornecedores:
 * detecta cabeçalho, extrai moeda/validade e filtra linhas de dados.
 */

const HEADER_KEYWORDS = [
  'produto',
  'descri',
  'refer',
  'complement',
  'custo',
  'preço',
  'preco',
  'valor',
  'sku',
  'codigo',
  'código',
  'item',
]

/** Palavras-chave por campo do sistema (mapeamento automático). */
const COLUMN_TARGET_KEYWORDS = {
  codigo_produto: [
    { pattern: /c[oó]digo\s*produto/i, score: 14 },
    { pattern: /^sku$/i, score: 12 },
    { pattern: /^c[oó]digo$/i, score: 11 },
    { pattern: /^produto$/i, score: 8 },
    { pattern: /item/i, score: 5 },
  ],
  produto: [
    { pattern: /descri[çc]/i, score: 12 },
    { pattern: /fertiliz/i, score: 10 },
    { pattern: /formula/i, score: 9 },
    { pattern: /^nome\b/i, score: 8 },
    { pattern: /produto/i, score: 6 },
    { pattern: /item/i, score: 4 },
  ],
  referencia_complementar: [
    { pattern: /refer[eê]ncia\s*complement/i, score: 15 },
    { pattern: /ref\.?\s*complement/i, score: 14 },
    { pattern: /complementar/i, score: 10 },
    { pattern: /refer[eê]ncia/i, score: 7 },
    { pattern: /^ref\.?\b/i, score: 6 },
    { pattern: /sku/i, score: 5 },
    { pattern: /c[oó]digo/i, score: 3 },
  ],
  preco_custo: [
    { pattern: /custo.*usd/i, score: 16 },
    { pattern: /pre[çc]o.*usd/i, score: 16 },
    { pattern: /custo.*fob/i, score: 14 },
    { pattern: /^revenda\b/i, score: 13 },
    { pattern: /pre[çc]o\s*m[ií]nimo/i, score: 12 },
    { pattern: /custo/i, score: 10 },
    { pattern: /pre[çc]o/i, score: 9 },
    { pattern: /valor/i, score: 7 },
    { pattern: /price/i, score: 7 },
  ],
}

const COLUMN_TARGET_PENALTIES = {
  codigo_produto: [/descri/i, /embalagem/i, /grupo/i, /fam[ií]lia/i, /caracter/i, /refer/i],
  produto: [/c[oó]digo\s*lista/i, /grupo/i, /embalagem/i, /caracter/i, /fam[ií]lia/i],
  referencia_complementar: [/embalagem/i, /grupo/i, /fam[ií]lia/i, /caracter/i],
  preco_custo: [
    /c[oó]digo/i,
    /embalagem/i,
    /grupo/i,
    /fam[ií]lia/i,
    /caracter/i,
    /r\$/i,
    /brl/i,
    /real/i,
    /d[oó]lar/i,
    /financeiro/i,
    /antecipa/i,
  ],
}

/** Nomes conhecidos de fornecedores (extraídos de planilhas-modelo). */
const KNOWN_FORNECEDOR_PATTERNS = [
  { pattern: /\byara\b/i, name: 'YARA' },
  { pattern: /\bmosaic\b/i, name: 'Mosaic' },
  { pattern: /\bnutrien\b/i, name: 'Nutrien' },
  { pattern: /\bheringer\b/i, name: 'Heringer' },
  { pattern: /\bfertipar\b/i, name: 'Fertipar' },
]

const TITLE_PATTERNS = [
  /lista\s+de\s+pre[çc]os/i,
  /tabela\s+de\s+pre[çc]os/i,
  /price\s+list/i,
]

const FOOTER_PATTERNS = [
  /^total\b/i,
  /^subtotal\b/i,
  /^obs\b/i,
  /^observa[çc]/i,
  /^nota\b/i,
  /^legenda\b/i,
]

const MOEDA_PATTERNS = [
  { code: 'USD', regex: /\b(?:USD|US\$|U\.S\.?\s*DOLLAR|D[ÓO]LAR(?:ES)?(?:\s+AMERICANO)?)\b/i },
  { code: 'EUR', regex: /\b(?:EUR|€|EURO(?:S)?)\b/i },
  { code: 'BRL', regex: /\b(?:BRL|R\$|REAL(?:IS)?)\b/i },
]

const MONTH_MAP = {
  jan: 0,
  janeiro: 0,
  fev: 1,
  fevereiro: 1,
  mar: 2,
  março: 2,
  marco: 2,
  abr: 3,
  abril: 3,
  mai: 4,
  maio: 4,
  jun: 5,
  junho: 5,
  jul: 6,
  julho: 6,
  ago: 7,
  agosto: 7,
  set: 8,
  setembro: 8,
  out: 9,
  outubro: 9,
  nov: 10,
  novembro: 10,
  dez: 11,
  dezembro: 11,
}

const MAX_SCAN_ROWS = 40

/** Máximo para numeric(14,2) no Postgres: 12 dígitos inteiros */
export const MAX_PRECO_DB = 999_999_999_999.99

export function cellToString(cell) {
  if (cell === null || cell === undefined) return ''
  return String(cell).trim()
}

export function isNumericLike(value) {
  const s = cellToString(value)
  if (!s) return false
  const normalized = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(normalized)
}

function normalizePrecoString(s) {
  const cleaned = s.replace(/[^\d,.-]/g, '')
  if (!cleaned) return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      return cleaned.replace(/\./g, '').replace(',', '.')
    }
    return cleaned.replace(/,/g, '')
  }
  if (lastComma >= 0) {
    return cleaned.replace(',', '.')
  }
  return cleaned
}

export function parsePrecoValue(value) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > MAX_PRECO_DB) return null
    return Math.round(value * 100) / 100
  }

  const s = cellToString(value)
  if (!s) return null

  const normalized = normalizePrecoString(s)
  if (!normalized) return null

  const n = Number.parseFloat(normalized)
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRECO_DB) return null
  return Math.round(n * 100) / 100
}

function normalizeText(value) {
  return cellToString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function countFilledCells(row) {
  return (row ?? []).filter((c) => cellToString(c).length > 0).length
}

function looksLikeTitleRow(row) {
  const text = (row ?? []).map(cellToString).join(' ')
  if (!text) return false
  if (TITLE_PATTERNS.some((p) => p.test(text))) return true
  const filled = countFilledCells(row)
  return filled <= 2 && text.length > 20
}

function scoreHeaderRow(matrix, rowIndex) {
  const row = matrix[rowIndex] ?? []
  const filled = countFilledCells(row)
  if (filled < 2) return -10

  let score = 0
  const labels = row.map((c) => normalizeText(c))

  for (const label of labels) {
    if (!label) continue
    if (HEADER_KEYWORDS.some((kw) => label.includes(kw))) score += 3
  }

  const textCells = row.filter((c) => cellToString(c) && !isNumericLike(c)).length
  const numericCells = row.filter((c) => isNumericLike(c)).length
  if (textCells >= numericCells) score += 2

  if (looksLikeTitleRow(row)) score -= 8

  const nextRow = matrix[rowIndex + 1]
  if (nextRow) {
    const hasPrice = nextRow.some((c) => parsePrecoValue(c) !== null)
    const hasRef = nextRow.some(
      (c) => cellToString(c).length > 0 && !isNumericLike(c),
    )
    if (hasPrice) score += 2
    if (hasRef) score += 1
  }

  return score
}

export function detectHeaderRow(matrix) {
  const limit = Math.min(matrix.length, MAX_SCAN_ROWS)
  let bestIndex = 0
  let bestScore = -Infinity

  for (let i = 0; i < limit; i++) {
    const score = scoreHeaderRow(matrix, i)
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  const confidence =
    bestScore >= 6 ? 'high' : bestScore >= 3 ? 'medium' : 'low'

  return { headerRowIndex: bestIndex, confidence, score: bestScore }
}

function cellRef(rowIndex, colIndex) {
  const col = String.fromCharCode(65 + (colIndex % 26))
  return `${col}${rowIndex + 1}`
}

export function extractCurrencyCandidates(matrix, beforeRowIndex) {
  const candidates = []
  const limit = Math.min(beforeRowIndex + 3, matrix.length)

  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const text = cellToString(row[c])
      if (!text) continue

      for (const { code, regex } of MOEDA_PATTERNS) {
        if (!regex.test(text)) continue
        let score = 5
        const lower = normalizeText(text)
        if (/moeda|currency|pre[çc]o|valor|custo/.test(lower)) score += 3
        if (r < beforeRowIndex) score += 1
        candidates.push({
          value: code,
          score,
          cellRef: cellRef(r, c),
          strategy: 'currency_regex',
          raw: text,
        })
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

function parseBrazilianDateParts(text) {
  const s = cellToString(text)
  if (!s) return null

  const br = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (br) {
    const day = Number(br[1])
    const month = Number(br[2]) - 1
    let year = Number(br[3])
    if (year < 100) year += 2000
    const d = new Date(year, month, day)
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d
    }
  }

  const monthYear = s.match(
    /(jan(?:eiro)?|fev(?:ereiro)?|mar(?:[çc]o)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\s*(?:de\s*)?[/\s.-]*(\d{4})/i,
  )
  if (monthYear) {
    const key = normalizeText(monthYear[1])
    const month = MONTH_MAP[key]
    const year = Number(monthYear[2])
    if (month !== undefined && year > 1990) {
      return new Date(year, month, 1)
    }
  }

  const monthSlashYear = s.match(
    /(\d{1,2})[/.-](\d{4})/,
  )
  if (monthSlashYear) {
    const month = Number(monthSlashYear[1]) - 1
    const year = Number(monthSlashYear[2])
    if (month >= 0 && month <= 11 && year > 1990) {
      return new Date(year, month, 1)
    }
  }

  return null
}

export function extractDateCandidates(matrix, beforeRowIndex) {
  const candidates = []
  const limit = Math.min(beforeRowIndex + 5, matrix.length)

  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const text = cellToString(row[c])
      if (!text) continue

      const date = parseBrazilianDateParts(text)
      if (!date) continue

      let score = 4
      const lower = normalizeText(text)
      if (/valid|vig[eê]n|expir|at[eé]|venc/.test(lower)) score += 4
      if (r < beforeRowIndex) score += 1

      candidates.push({
        value: date,
        score,
        cellRef: cellRef(r, c),
        strategy: 'date_parse',
        raw: text,
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

export function dateToQuarter(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const q = Math.floor(date.getMonth() / 3) + 1
  return `Q${q} ${date.getFullYear()}`
}

const QUARTER_TEXT_REGEX = /\bQ\s*([1-4])\b(?:\s*[-/]?\s*(\d{4}))?/i

/**
 * Busca quarter explícito (QX ou QX YYYY) em qualquer célula da planilha.
 */
export function detectQuarterText(matrix, maxRows = MAX_SCAN_ROWS) {
  const candidates = []
  const limit = Math.min(matrix.length, maxRows)

  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const text = cellToString(row[c])
      if (!text) continue

      const match = text.match(QUARTER_TEXT_REGEX)
      if (!match) continue

      const qNum = Number(match[1])
      const year = match[2] ? Number(match[2]) : new Date().getFullYear()
      const value = `Q${qNum} ${year}`

      let score = 6
      const lower = normalizeText(text)
      if (/quarter|trimestre|lista|periodo|per[ií]odo/.test(lower)) score += 3
      if (r < 10) score += 1

      candidates.push({
        value,
        score,
        cellRef: cellRef(r, c),
        strategy: 'quarter_text',
        raw: text,
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

export function addDaysToDate(date, days) {
  const d = new Date(date.getTime())
  d.setDate(d.getDate() + days)
  return d
}

export function defaultValidadeDate() {
  const year = new Date().getFullYear()
  return new Date(year, 11, 31)
}

function hasValidadeKeyword(text) {
  const lower = normalizeText(text ?? '')
  return /valid|vig[eê]n|expir|at[eé]|venc/.test(lower)
}

function pickDetectedValidade(dateCandidates) {
  const withKeyword = dateCandidates.filter((c) => hasValidadeKeyword(c.raw))
  return withKeyword[0]?.value ?? null
}

export function dateToIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isFooterRow(row) {
  const first = cellToString(row?.[0])
  if (!first) return false
  return FOOTER_PATTERNS.some((p) => p.test(first))
}

function isMetadataNoiseInProductColumn(value) {
  const text = cellToString(value)
  if (text.length < 40) return false
  return /valid|vig[eê]n|expir|moeda|lista\s+de\s+pre[çc]os/i.test(text)
}

export function findEmbalagemColumnIndex(matrix, headerRowIndex) {
  const header = matrix[headerRowIndex] ?? []
  for (let i = 0; i < header.length; i++) {
    if (/embalagem/i.test(cellToString(header[i]))) return i
  }
  return undefined
}

export function normalizeEmbalagemLabel(value) {
  return cellToString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

/** Apenas embalagem literal 1000KG (exclui Pallet 1000KG, 25KG, etc.). */
export function isEmbalagem1000Kg(value) {
  return normalizeEmbalagemLabel(value) === '1000kg'
}

/**
 * Filtra linhas de dados após o cabeçalho.
 * @param {unknown[][]} matrix
 * @param {number} headerRowIndex
 * @param {{ produtoIndex?: number, referenciaIndex?: number, precoIndex?: number, embalagemIndex?: number }} [opts]
 */
export function filterDataRows(matrix, headerRowIndex, opts = {}) {
  const { produtoIndex, referenciaIndex, precoIndex, embalagemIndex } = opts
  const rows = []

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? []
    if (!row.some((c) => cellToString(c).length > 0)) continue
    if (isFooterRow(row)) continue

    if (produtoIndex !== undefined) {
      const produto = cellToString(row[produtoIndex])
      if (!produto) continue
      if (isMetadataNoiseInProductColumn(produto)) continue
    }

    if (referenciaIndex !== undefined) {
      const ref = cellToString(row[referenciaIndex])
      if (ref && isMetadataNoiseInProductColumn(ref)) continue
    }

    if (precoIndex !== undefined) {
      const preco = parsePrecoValue(row[precoIndex])
      if (preco === null) continue
    }

    if (embalagemIndex !== undefined) {
      const embalagem = cellToString(row[embalagemIndex])
      if (!isEmbalagem1000Kg(embalagem)) continue
    }

    rows.push(row)
  }

  return rows
}

export function buildColumnsFromHeader(matrix, headerRowIndex) {
  const headerCells = matrix[headerRowIndex] ?? []
  return headerCells
    .map((cell, index) => {
      const label = cellToString(cell)
      return {
        id: `col-${index}`,
        index,
        label: label || `Coluna ${index + 1}`,
      }
    })
    .filter((col) => col.label.length > 0)
}

function scoreColumnForTarget(label, target) {
  const normalized = normalizeText(label)
  if (!normalized) return 0

  let score = 0
  const keywords = COLUMN_TARGET_KEYWORDS[target] ?? []
  for (const { pattern, score: pts } of keywords) {
    if (pattern.test(label) || pattern.test(normalized)) score += pts
  }

  const penalties = COLUMN_TARGET_PENALTIES[target] ?? []
  for (const pattern of penalties) {
    if (pattern.test(label) || pattern.test(normalized)) score -= 8
  }

  return score
}

function isMostlyNumericColumn(matrix, colIndex, headerRowIndex, sampleSize = 20) {
  const rows = []
  for (let i = headerRowIndex + 1; i < matrix.length && rows.length < sampleSize; i++) {
    const val = cellToString(matrix[i]?.[colIndex])
    if (val) rows.push(val)
  }
  if (rows.length === 0) return false
  const numericCount = rows.filter((v) => isNumericLike(v) || parsePrecoValue(v) !== null).length
  return numericCount / rows.length >= 0.7
}

function isMostlyCodeColumn(matrix, colIndex, headerRowIndex, sampleSize = 20) {
  const rows = []
  for (let i = headerRowIndex + 1; i < matrix.length && rows.length < sampleSize; i++) {
    const val = cellToString(matrix[i]?.[colIndex])
    if (val) rows.push(val)
  }
  if (rows.length === 0) return false
  const codeLike = rows.filter((v) => /^\d{8,}$/.test(v.replace(/\s/g, ''))).length
  return codeLike / rows.length >= 0.6
}

function isMostlyTextColumn(matrix, colIndex, headerRowIndex, sampleSize = 20) {
  const rows = []
  for (let i = headerRowIndex + 1; i < matrix.length && rows.length < sampleSize; i++) {
    const val = cellToString(matrix[i]?.[colIndex])
    if (val) rows.push(val)
  }
  if (rows.length === 0) return false
  const textCount = rows.filter(
    (v) => !isNumericLike(v) && parsePrecoValue(v) === null,
  ).length
  return textCount / rows.length >= 0.5
}

function confidenceFromScore(score, isRequired = false) {
  if (score >= 10) return 'high'
  if (score >= 5) return 'medium'
  if (score > 0 || !isRequired) return 'low'
  return 'low'
}

/**
 * Mapeia colunas automaticamente para campos do sistema.
 * @returns {{ mappings: Array<{sourceIndex, sourceLabel, target}>, confidence: Record<string, string>, missingRequired: string[] }}
 */
export function autoMapColumns(matrix, headerRowIndex) {
  const columns = buildColumnsFromHeader(matrix, headerRowIndex)
  const targets = ['codigo_produto', 'produto', 'referencia_complementar', 'preco_custo']
  const scoresByTarget = {}

  for (const target of targets) {
    scoresByTarget[target] = columns.map((col) => {
      let score = scoreColumnForTarget(col.label, target)

      if (target === 'preco_custo') {
        if (isMostlyNumericColumn(matrix, col.index, headerRowIndex)) score += 5
        else score -= 6
      }
      if (target === 'codigo_produto') {
        if (isMostlyCodeColumn(matrix, col.index, headerRowIndex)) score += 10
        else score -= 8
        if (isMostlyTextColumn(matrix, col.index, headerRowIndex)) score -= 6
      }
      if (target === 'produto') {
        if (isMostlyTextColumn(matrix, col.index, headerRowIndex)) score += 4
        if (isMostlyCodeColumn(matrix, col.index, headerRowIndex)) score -= 10
        if (/^produto$/i.test(col.label) && isMostlyCodeColumn(matrix, col.index, headerRowIndex)) {
          score -= 8
        }
      }
      if (target === 'referencia_complementar') {
        if (isMostlyTextColumn(matrix, col.index, headerRowIndex)) score += 2
      }

      return { col, score }
    })
  }

  const assigned = new Map()
  const targetOrder = ['preco_custo', 'codigo_produto', 'produto', 'referencia_complementar']

  for (const target of targetOrder) {
    const ranked = [...scoresByTarget[target]].sort((a, b) => b.score - a.score)
    const best = ranked.find((r) => r.score > 0 && !assigned.has(r.col.index))
    if (best) assigned.set(best.col.index, target)
  }

  const confidence = {}
  for (const target of targets) {
    const colIndex = [...assigned.entries()].find(([, t]) => t === target)?.[0]
    if (colIndex === undefined) {
      confidence[target] = 'low'
      continue
    }
    const entry = scoresByTarget[target].find((r) => r.col.index === colIndex)
    confidence[target] = confidenceFromScore(entry?.score ?? 0, target !== 'referencia_complementar')
  }

  const mappings = columns.map((col) => ({
    sourceIndex: col.index,
    sourceLabel: col.label,
    target: assigned.get(col.index) ?? '__ignore__',
  }))

  const missingRequired = ['produto', 'preco_custo'].filter(
    (t) => !mappings.some((m) => m.target === t),
  )

  return { mappings, confidence, missingRequired }
}

/**
 * Detecta nome do fornecedor a partir do arquivo e do conteúdo da planilha.
 */
export function detectFornecedor({ fileName = '', matrix = [] } = {}) {
  const candidates = []
  const sources = []

  if (fileName) {
    sources.push({ text: fileName, strategy: 'filename', scoreBoost: 2 })
  }

  const scanLimit = Math.min(matrix.length, 15)
  for (let r = 0; r < scanLimit; r++) {
    const rowText = (matrix[r] ?? []).map(cellToString).join(' ')
    if (rowText.trim()) {
      sources.push({ text: rowText, strategy: 'sheet_title', scoreBoost: r < 5 ? 3 : 1 })
    }
  }

  for (const source of sources) {
    for (const { pattern, name } of KNOWN_FORNECEDOR_PATTERNS) {
      if (!pattern.test(source.text)) continue
      let score = 8 + source.scoreBoost
      if (/lista\s+de\s+pre[çc]os/i.test(source.text)) score += 4
      candidates.push({
        value: name,
        score,
        strategy: source.strategy,
        raw: source.text.slice(0, 120),
      })
    }

    const titleMatch = source.text.match(
      /lista\s+de\s+pre[çc]os\s*[-–]\s*([^|(\n]+)/i,
    )
    if (titleMatch) {
      const rawName = titleMatch[1].trim().replace(/\s+/g, ' ')
      if (rawName.length >= 2 && rawName.length <= 80) {
        candidates.push({
          value: rawName,
          score: 6 + source.scoreBoost,
          strategy: 'title_extract',
          raw: rawName,
        })
      }
    }
  }

  const fileParts = String(fileName)
    .replace(/\.(xlsx|xls|csv)$/i, '')
    .split(/[_\s-]+/)
    .filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !/^q\d$/i.test(p))

  for (const part of fileParts) {
    const upper = part.toUpperCase()
    if (['LISTA', 'FERTILIZANTE', 'CAMPANHA', 'SOJA', 'SUDESTE'].includes(upper)) {
      continue
    }
    const known = KNOWN_FORNECEDOR_PATTERNS.find((k) => k.pattern.test(part))
    if (known) {
      candidates.push({
        value: known.name,
        score: 5,
        strategy: 'filename_token',
        raw: part,
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  const best = candidates[0]
  return {
    fornecedorNome: best?.value ?? '',
    confidence:
      best?.score >= 10 ? 'high' : best?.score >= 6 ? 'medium' : best ? 'low' : 'none',
    candidates: candidates.slice(0, 5),
  }
}

export function buildColumnMappingsFromAutoMap(autoMapResult) {
  return (autoMapResult?.mappings ?? []).map((m) => ({
    sourceIndex: m.sourceIndex,
    sourceLabel: m.sourceLabel,
    target: m.target,
  }))
}

/**
 * Analisa a matriz bruta da planilha.
 */
export function analyzeSpreadsheet(matrix) {
  if (!matrix?.length) {
    return {
      ok: false,
      error: 'Nenhuma linha encontrada na planilha.',
    }
  }

  const { headerRowIndex, confidence, score } = detectHeaderRow(matrix)
  const columns = buildColumnsFromHeader(matrix, headerRowIndex)
  if (columns.length === 0) {
    return {
      ok: false,
      error: 'Não foi possível identificar colunas na linha de cabeçalho.',
    }
  }

  const moedaCandidates = extractCurrencyCandidates(matrix, headerRowIndex)
  const dateCandidates = extractDateCandidates(matrix, headerRowIndex)
  const quarterCandidates = detectQuarterText(matrix)

  const autoMap = autoMapColumns(matrix, headerRowIndex)
  const produtoIdx = autoMap.mappings.find((m) => m.target === 'produto')?.sourceIndex
  const precoIdx = autoMap.mappings.find((m) => m.target === 'preco_custo')?.sourceIndex
  const referenciaIdx = autoMap.mappings.find(
    (m) => m.target === 'referencia_complementar',
  )?.sourceIndex
  const embalagemIdx = findEmbalagemColumnIndex(matrix, headerRowIndex)

  const moedaDetectada = 'USD'
  const detectedValidade = pickDetectedValidade(dateCandidates)
  const dataValidadeDate = detectedValidade ?? defaultValidadeDate()
  const quarterFromText = quarterCandidates[0]?.value ?? ''
  const quarterCalculado =
    quarterFromText ||
    (detectedValidade ? dateToQuarter(detectedValidade) : dateToQuarter(dataValidadeDate))

  const dataRows = filterDataRows(matrix, headerRowIndex, {
    produtoIndex: produtoIdx,
    referenciaIndex: referenciaIdx,
    precoIndex: precoIdx,
    embalagemIndex: embalagemIdx,
  })

  return {
    ok: true,
    headerRowIndex,
    headerConfidence: confidence,
    headerScore: score,
    columns,
    dataRows,
    moedaDetectada,
    dataValidade: dateToIsoDate(dataValidadeDate),
    quarterCalculado,
    autoMappings: autoMap.mappings,
    autoMapConfidence: autoMap.confidence,
    autoMapMissingRequired: autoMap.missingRequired,
    metadataPlanilha: {
      headerRowIndex,
      headerConfidence: confidence,
      headerScore: score,
      moedaCandidates: moedaCandidates.slice(0, 5),
      dateCandidates: dateCandidates.slice(0, 5).map((c) => ({
        ...c,
        value: c.value instanceof Date ? dateToIsoDate(c.value) : c.value,
      })),
      quarterCandidates: quarterCandidates.slice(0, 5),
      validadeDefaultAplicada: !detectedValidade,
      autoMapConfidence: autoMap.confidence,
      autoMapMissingRequired: autoMap.missingRequired,
    },
  }
}
