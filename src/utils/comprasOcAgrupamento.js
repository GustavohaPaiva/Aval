/**
 * Agrupa linhas de demanda por fornecedor. Uma OC por fornecedor, não por produto.
 */
export function agruparLinhasPorFornecedor(linhas) {
  const byForn = new Map()
  for (const row of linhas ?? []) {
    const fid = row.product?.fornecedor_id
    if (!fid) {
      return {
        ok: false,
        error: 'Há produto sem fornecedor. Não é possível gerar a ordem de compra.',
      }
    }
    if (!byForn.has(fid)) byForn.set(fid, [])
    byForn.get(fid).push(row)
  }
  return { ok: true, groups: [...byForn.entries()] }
}
