const CANONICAL = [
  ['uberaba', ['uberaba', 'filial uberaba']],
  ['nova-ponte', ['nova ponte', 'matriz nova ponte', 'matriz', 'nova ponte mg', 'filial nova ponte']],
  ['guaira', ['guaira', 'filial guaira']],
  ['ituverava', ['ituverava', 'filial ituverava']],
  ['frutal', ['frutal', 'filial frutal']],
]

function fold(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Código oficial da filial. Texto desconhecido permanece, sem ser apagado. */
export function normalizeFilialCode(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const key = fold(raw)
  for (const [code, names] of CANONICAL) {
    if (names.some((name) => key === fold(name)) || key === code) return code
  }
  return raw
}

/** Nova venda: gestor fica em Uberaba; consultor usa a filial já normalizada do perfil. */
export function filialVendaForProfile(profile) {
  if (profile?.role === 'gestor') return 'uberaba'
  return normalizeFilialCode(profile?.filial)
}
