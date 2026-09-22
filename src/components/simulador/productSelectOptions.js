/**
 * Products filtered by fornecedor, always including the line's current product
 * so the Select does not fall back to "Selecione…" when the id is still set.
 */
export function productsForLineSelect(
  productOptions,
  { fornecedorId, productId, displayNome } = {},
) {
  const base = !fornecedorId
    ? productOptions ?? []
    : (productOptions ?? []).filter(
        (p) => String(p.fornecedorId ?? '') === String(fornecedorId),
      )

  const selectedId = productId ? String(productId) : ''
  if (!selectedId) return base

  const hasSelected = base.some((p) => String(p.id) === selectedId)
  if (hasSelected) return base

  const fromCatalog = (productOptions ?? []).find(
    (p) => String(p.id) === selectedId,
  )
  const fallback = fromCatalog ?? {
    id: selectedId,
    nome: displayNome || '—',
    displayNome: displayNome || '—',
    referenciaComplementar: '',
    fornecedorNome: '',
    fornecedorId: fornecedorId ? String(fornecedorId) : '',
  }

  return [fallback, ...base]
}
