import { describe, expect, it } from 'vitest'
import { agruparLinhasPorFornecedor } from './comprasOcAgrupamento'

describe('agruparLinhasPorFornecedor', () => {
  it('gera um grupo por fornecedor, com todos os produtos juntos', () => {
    const linhas = [
      { product: { id: 'p1', fornecedor_id: 'A' } },
      { product: { id: 'p2', fornecedor_id: 'A' } },
      { product: { id: 'p3', fornecedor_id: 'B' } },
      { product: { id: 'p4', fornecedor_id: 'A' } },
      { product: { id: 'p5', fornecedor_id: 'B' } },
      { product: { id: 'p6', fornecedor_id: 'A' } },
      { product: { id: 'p7', fornecedor_id: 'A' } },
    ]
    const res = agruparLinhasPorFornecedor(linhas)
    expect(res.ok).toBe(true)
    expect(res.groups).toHaveLength(2)
    expect(res.groups[0][0]).toBe('A')
    expect(res.groups[0][1]).toHaveLength(5)
    expect(res.groups[1][0]).toBe('B')
    expect(res.groups[1][1]).toHaveLength(2)
  })

  it('falha se algum produto não tem fornecedor', () => {
    const res = agruparLinhasPorFornecedor([
      { product: { id: 'p1', fornecedor_id: 'A' } },
      { product: { id: 'p2' } },
    ])
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/sem fornecedor/i)
  })
})
