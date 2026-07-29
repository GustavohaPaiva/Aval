import { normalizeFertilizante } from './normalizeSku'

/**
 * Prefixos de produtos especiais (Yara + Cibra).
 * Matching é case-insensitive e ignora variação de espaços.
 * Ordem: mais longos primeiro para desambiguar (ex.: YaraBasa Full vs YaraBasa).
 */
export const PREFIXOS_PRODUTO_ESPECIAL = [
  'YaraBasa Full',
  'YaraMila',
  'YaraMila High N',
  'YaraMila Triples',
  'Basefort Duo',
  'Basefort S',
  'Poly4 Duo',
  'YaraBasa',
  'YaraBela',
  'YaraTera',
  'YaraLiva',
  'YaraRega',
  'Poly4',
]

/** Remove espaços para matching tolerante a "YaraBasa" vs "Yara Basa". */
function compactName(nome) {
  return normalizeFertilizante(nome).replace(/\s+/g, '')
}

const PREFIXOS_COMPACT = PREFIXOS_PRODUTO_ESPECIAL.map((p) => compactName(p)).sort(
  (a, b) => b.length - a.length,
)

/**
 * Classifica o produto como Especial ou Convencional com base no nome.
 * @param {string} nome
 * @returns {'Especial' | 'Convencional'}
 */
export function classifyProdutoClasse(nome) {
  const compact = compactName(nome)
  if (!compact) return 'Convencional'
  const isEspecial = PREFIXOS_COMPACT.some((prefix) => compact.startsWith(prefix))
  return isEspecial ? 'Especial' : 'Convencional'
}
