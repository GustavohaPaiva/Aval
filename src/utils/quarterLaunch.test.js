import { describe, expect, it, vi } from 'vitest'
import {
  formatQuarterLaunchFailure,
  formatQuarterLaunchSuccess,
  planQuarterLaunch,
  recordQuarterGroups,
  runQuarterLaunch,
} from './quarterLaunch'

function produto(nome, quarter, preco, quantidade) {
  return { nome, quarter, preco, quantidade, desconto: 0, estado: 'MG' }
}

function lote(loteId, quarter, produtos, status = 'aguardando_validacao') {
  return {
    loteId,
    quarter,
    status,
    moeda: 'USD',
    estadoPadrao: 'MG',
    ativo: true,
    produtos,
  }
}

describe('lançamento dos quarters da Cibra', () => {
  it('lista com um quarter grava só esse lote', async () => {
    const entry = lote('lote-q3', 'Q3 2026', [
      produto('MAP', 'Q3 2026', 100, 1),
    ])
    const promote = vi.fn(async () => ({
      ok: true,
      result: { novos: 1, atualizacoes: 0, listas_inativadas: 0 },
    }))

    const res = await runQuarterLaunch([entry], promote)

    expect(res.ok).toBe(true)
    expect(promote).toHaveBeenCalledTimes(1)
    expect(promote.mock.calls[0][0].loteId).toBe('lote-q3')
    expect(promote.mock.calls[0][0].quarter).toBe('Q3 2026')
    expect(formatQuarterLaunchSuccess(res)).toBe(
      'Lista lançada com sucesso: 1 novo(s), 0 atualização(ões).',
    )
  })

  it('lista com dois quarters grava os dois, cada um no seu lote', async () => {
    const q3 = lote('lote-q3', 'Q3 2026', [produto('MAP', 'Q3 2026', 100, 2)])
    const q4 = lote('lote-q4', 'Q4 2026', [produto('MAP', 'Q4 2026', 180, 5)])
    const promote = vi.fn(async (entry) => ({
      ok: true,
      result: { novos: entry.produtos.length, atualizacoes: 0 },
    }))

    const res = await runQuarterLaunch([q4, q3], promote)

    expect(res.ok).toBe(true)
    expect(promote.mock.calls.map((call) => call[0].loteId)).toEqual([
      'lote-q3',
      'lote-q4',
    ])
    expect(promote.mock.calls[0][0].produtos[0]).toMatchObject({
      quarter: 'Q3 2026',
      preco: 100,
      quantidade: 2,
    })
    expect(promote.mock.calls[1][0].produtos[0]).toMatchObject({
      quarter: 'Q4 2026',
      preco: 180,
      quantidade: 5,
    })
  })

  it('lista com três quarters grava todos sem misturar produtos', async () => {
    const entries = [
      lote('lote-q1', 'Q1 2027', [produto('Ureia', 'Q1 2027', 90, 10)]),
      lote('lote-q3', 'Q3 2026', [produto('MAP', 'Q3 2026', 110, 3)]),
      lote('lote-q4', 'Q4 2026', [
        produto('KCl', 'Q4 2026', 70, 8),
        produto('MAP', 'Q4 2026', 175, 1),
      ]),
    ]
    const promote = vi.fn(async (entry) => ({
      ok: true,
      result: { novos: entry.produtos.length, atualizacoes: 0 },
    }))

    const res = await runQuarterLaunch(entries, promote)

    expect(res.ok).toBe(true)
    expect(res.launched.map((item) => item.quarter)).toEqual([
      'Q1 2027',
      'Q3 2026',
      'Q4 2026',
    ])
    const gravados = promote.mock.calls.map((call) => ({
      quarter: call[0].quarter,
      produtos: call[0].produtos.map((item) => ({
        nome: item.nome,
        preco: item.preco,
        quantidade: item.quantidade,
      })),
    }))
    expect(gravados).toEqual([
      { quarter: 'Q1 2027', produtos: [{ nome: 'Ureia', preco: 90, quantidade: 10 }] },
      { quarter: 'Q3 2026', produtos: [{ nome: 'MAP', preco: 110, quantidade: 3 }] },
      {
        quarter: 'Q4 2026',
        produtos: [
          { nome: 'KCl', preco: 70, quantidade: 8 },
          { nome: 'MAP', preco: 175, quantidade: 1 },
        ],
      },
    ])
    expect(entries[2].produtos[1].preco).toBe(175)
  })

  it('tentativa repetida não grava de novo o quarter já concluído', async () => {
    const entries = [
      lote('lote-q3', 'Q3 2026', [produto('MAP', 'Q3 2026', 100, 2)], 'concluido'),
      lote('lote-q4', 'Q4 2026', [produto('MAP', 'Q4 2026', 180, 5)], 'concluido'),
    ]
    const promote = vi.fn()

    const res = await runQuarterLaunch(entries, promote)

    expect(res.ok).toBe(true)
    expect(res.repeated).toBe(true)
    expect(promote).not.toHaveBeenCalled()
    expect(formatQuarterLaunchSuccess(res)).toMatch(/já estavam lançados/)
  })

  it('falha no meio não grava os quarters seguintes e a nova tentativa ignora o que já entrou', async () => {
    const entries = [
      lote('lote-q3', 'Q3 2026', [produto('MAP', 'Q3 2026', 100, 2)]),
      lote('lote-q4', 'Q4 2026', [produto('MAP', 'Q4 2026', 180, 5)]),
      lote('lote-q1', 'Q1 2027', [produto('Ureia', 'Q1 2027', 90, 4)]),
    ]
    const promote = vi.fn(async (entry) => {
      if (entry.loteId === 'lote-q3') {
        return { ok: false, error: 'cotação indisponível' }
      }
      return { ok: true, result: { novos: 1, atualizacoes: 0 } }
    })

    const first = await runQuarterLaunch(entries, promote)

    expect(first.ok).toBe(false)
    expect(first.phase).toBe('write')
    expect(first.launched.map((item) => item.loteId)).toEqual(['lote-q1'])
    expect(first.failed.loteId).toBe('lote-q3')
    expect(first.pending.map((item) => item.loteId)).toEqual(['lote-q4'])
    expect(promote).toHaveBeenCalledTimes(2)
    expect(formatQuarterLaunchFailure(first)).toMatch(/Q3 2026/)
    expect(formatQuarterLaunchFailure(first)).toMatch(/Já lançados: Q1 2027/)
    expect(formatQuarterLaunchFailure(first)).toMatch(/Q4 2026/)

    promote.mockClear()
    const retryEntries = entries.map((entry) =>
      entry.loteId === 'lote-q1' ? { ...entry, status: 'concluido' } : entry,
    )
    const second = await runQuarterLaunch(retryEntries, promote)

    expect(second.ok).toBe(false)
    expect(promote.mock.calls.map((call) => call[0].loteId)).toEqual(['lote-q3'])
    expect(second.alreadyLaunched.map((item) => item.loteId)).toEqual(['lote-q1'])
    expect(second.pending.map((item) => item.loteId)).toEqual(['lote-q4'])
  })

  it('erro de validação em um quarter não grava nenhum', async () => {
    const entries = [
      lote('lote-q3', 'Q3 2026', [produto('MAP', 'Q3 2026', 100, 2)]),
      lote('lote-q4', 'Q4 2026', [
        { ...produto('MAP', 'Q4 2026', -1, 5), erros: ['Preço inválido'] },
      ]),
    ]
    const promote = vi.fn()
    const res = await runQuarterLaunch(entries, promote)

    expect(res.ok).toBe(false)
    expect(res.phase).toBe('preflight')
    expect(res.launched).toEqual([])
    expect(promote).not.toHaveBeenCalled()
    expect(planQuarterLaunch(entries).error).toMatch(/Q4 2026/)
  })
})

describe('gravação dos grupos antes do lançamento', () => {
  it('desfaz os grupos já criados quando um quarter seguinte falha', async () => {
    const removeGroup = vi.fn(async () => ({ ok: true }))
    const createGroup = vi.fn(async (group) => {
      if (group.quarter === 'Q1 2027') {
        return { ok: false, error: 'tempo esgotado' }
      }
      return { ok: true, loteId: `lote-${group.quarter}` }
    })

    const res = await recordQuarterGroups(
      [{ quarter: 'Q3 2026' }, { quarter: 'Q4 2026' }, { quarter: 'Q1 2027' }],
      { createGroup, removeGroup },
    )

    expect(res.ok).toBe(false)
    expect(res.removed.map((item) => item.quarter)).toEqual(['Q3 2026', 'Q4 2026'])
    expect(res.stuck).toEqual([])
    expect(removeGroup).toHaveBeenCalledTimes(2)
  })

  it('informa o grupo que não pôde ser desfeito para evitar uma segunda gravação', async () => {
    const res = await recordQuarterGroups(
      [{ quarter: 'Q3 2026' }, { quarter: 'Q4 2026' }],
      {
        createGroup: async (group) =>
          group.quarter === 'Q4 2026'
            ? { ok: false, error: 'falha' }
            : { ok: true, loteId: 'lote-q3' },
        removeGroup: async () => ({ ok: false, error: 'sem permissão' }),
      },
    )

    expect(res.ok).toBe(false)
    expect(res.stuck.map((item) => item.loteId)).toEqual(['lote-q3'])
    expect(res.removed).toEqual([])
  })
})
