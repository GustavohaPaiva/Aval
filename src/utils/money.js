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

/** Formata pontos percentuais (ex.: 0.5 → 0,50%). */
export function formatPercentPoints(value, decimals = 2) {
    if (value == null || value === '') return '—'
    const num = Number(value)
    if (!Number.isFinite(num)) return '—'
    return `${num.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })}%`
}

/** Exibe comissão como "0,50% / R$ 1.234,56". */
export function formatComissaoPctValor(percentual, valor, decimals = 2) {
    return `${formatPercentPoints(percentual ?? 0, decimals)} / ${formatBRL(Number(valor) || 0)}`
}
