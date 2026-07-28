import { describe, expect, it, vi, beforeEach } from 'vitest'

const fromMock = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
  },
}))

describe('computeStagingMatch quarter differentiation', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('trata mesmo fertilizante em Q3 e Q4 como novo, não atualização', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              {
                id: 'po-q3',
                nome: 'BASEFORT DUO 03-28-06 + 6S MG',
                quarter: 'Q3 2026',
                estado: 'MG',
              },
            ],
            error: null,
          }),
      }),
    })

    const { computeStagingMatch } = await import('./produtoImportacaoService')

    const res = await computeStagingMatch(
      'forn-1',
      [
        {
          id: 's1',
          nome: 'BASEFORT DUO 03-28-06 + 6S MG',
          quarter: 'Q4 2026',
          estado: 'MG',
          preco_original: 739.73,
          desconto_usd: 0,
          sku_fornecedor: '10026552',
          dados_brutos: { _codigo_produto: '10026552' },
        },
      ],
      { loteEstadoPadrao: 'MG', loteQuarter: 'Q4 2026' },
    )

    expect(res.ok).toBe(true)
    expect(res.summary).toEqual({ novos: 1, atualizacoes: 0, erros: 0 })
    expect(res.rows[0].status_linha).toBe('novo')
  })

  it('marca atualização só com mesmo quarter e estado', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              {
                id: 'po-q4',
                nome: 'BASEFORT DUO 03-28-06 + 6S MG',
                quarter: 'Q4 2026',
                estado: 'MG',
              },
            ],
            error: null,
          }),
      }),
    })

    const { computeStagingMatch } = await import('./produtoImportacaoService')

    const res = await computeStagingMatch(
      'forn-1',
      [
        {
          id: 's1',
          nome: 'BASEFORT DUO 03-28-06 + 6S MG',
          quarter: 'Q4 2026',
          estado: 'MG',
          preco_original: 739.73,
          desconto_usd: 0,
          sku_fornecedor: '10026552',
          dados_brutos: { _codigo_produto: '10026552' },
        },
      ],
      { loteEstadoPadrao: 'MG', loteQuarter: 'Q4 2026' },
    )

    expect(res.ok).toBe(true)
    expect(res.summary).toEqual({ novos: 0, atualizacoes: 1, erros: 0 })
    expect(res.rows[0].status_linha).toBe('atualizacao')
  })
})
