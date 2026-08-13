import { describe, expect, it } from 'vitest'
import {
  DRAFT_TTL_DAYS,
  draftExpiryCutoffIso,
  isCountedInStats,
  isHiddenDraft,
} from './simulationLifecycle'

describe('simulationLifecycle', () => {
  const now = new Date('2026-08-13T12:00:00.000Z')

  it('esconde rascunho após 7 dias', () => {
    expect(
      isHiddenDraft(
        {
          status: 'draft',
          ativo: true,
          updated_at: '2026-08-06T11:59:00.000Z',
        },
        now,
      ),
    ).toBe(true)
    expect(
      isHiddenDraft(
        {
          status: 'draft',
          ativo: true,
          updated_at: '2026-08-06T12:01:00.000Z',
        },
        now,
      ),
    ).toBe(false)
  })

  it('esconde rascunho inativo mesmo recente', () => {
    expect(
      isHiddenDraft(
        {
          status: 'draft',
          ativo: false,
          updated_at: '2026-08-13T11:00:00.000Z',
        },
        now,
      ),
    ).toBe(true)
  })

  it('não esconde simulação aprovada inativa da listagem', () => {
    expect(
      isHiddenDraft(
        {
          status: 'approved',
          ativo: false,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(false)
  })

  it('tira inativos e rascunhos expirados das estatísticas', () => {
    expect(isCountedInStats({ status: 'approved', ativo: true })).toBe(true)
    expect(isCountedInStats({ status: 'approved', ativo: false })).toBe(false)
    expect(
      isCountedInStats({
        status: 'draft',
        ativo: true,
        updated_at: '2026-08-01T00:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('calcula cutoff de 7 dias', () => {
    expect(DRAFT_TTL_DAYS).toBe(7)
    expect(draftExpiryCutoffIso(now)).toBe('2026-08-06T12:00:00.000Z')
  })
})
