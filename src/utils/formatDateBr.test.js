import { describe, expect, it } from 'vitest'
import { formatDateBr } from './formatDateBr'

describe('formatDateBr', () => {
  it('não recua um dia em datas só-dia (Postgres DATE)', () => {
    expect(formatDateBr('2026-09-17')).toBe('17/09/2026')
  })

  it('mantém timestamps no fuso local', () => {
    expect(formatDateBr('2026-09-17T15:00:00.000Z')).toBe(
      new Date('2026-09-17T15:00:00.000Z').toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
    )
  })

  it('retorna traço para vazio ou inválido', () => {
    expect(formatDateBr(null)).toBe('—')
    expect(formatDateBr('')).toBe('—')
    expect(formatDateBr('nao-e-data')).toBe('—')
  })
})
