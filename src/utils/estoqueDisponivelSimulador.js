function normText(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR')
}

export function produtoEstoqueIdentityKey({
  nome,
  fornecedorId,
  fornecedor_id,
  referenciaComplementar,
  referencia_complementar,
} = {}) {
  const n = normText(nome)
  const f = String(fornecedorId ?? fornecedor_id ?? '').trim()
  if (!n || !f) return null
  const r = normText(referenciaComplementar ?? referencia_complementar)
  return `${n}||${f}||${r}`
}

export function indexEstoqueDisponivel(rows) {
  const byId = new Map()
  const byKey = new Map()
  for (const row of rows ?? []) {
    const kg = Number(row.disponivel_kg ?? row.disponivelKg) || 0
    if (kg <= 0.0001) continue
    const id = row.produto_oficial_id ?? row.produtoOficialId
    if (id) byId.set(String(id), (byId.get(String(id)) ?? 0) + kg)
    const key = produtoEstoqueIdentityKey({
      nome: row.nome,
      fornecedorId: row.fornecedor_id ?? row.fornecedorId,
      referenciaComplementar:
        row.referencia_complementar ?? row.referenciaComplementar,
    })
    if (key) byKey.set(key, (byKey.get(key) ?? 0) + kg)
  }
  return { byId, byKey }
}

export function lookupEstoqueDisponivelKg(index, product) {
  if (!index || !product) return 0
  const key = produtoEstoqueIdentityKey(product)
  const byKey = key ? (index.byKey.get(key) ?? 0) : 0
  if (byKey > 0.0001) return byKey
  const id = product.id ?? product.produto_oficial_id
  if (!id) return 0
  return index.byId.get(String(id)) ?? 0
}
