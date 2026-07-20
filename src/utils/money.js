/** Formata valor monetário (pt-BR) — use junto com a classe `.finance-text` na UI */
export function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

/** Formata razão (0–1) como percentual pt-BR. */
export function formatPercent(ratio, decimals = 1) {
    if (ratio == null || !Number.isFinite(ratio)) return '—'
    return `${(ratio * 100).toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })}%`
}
