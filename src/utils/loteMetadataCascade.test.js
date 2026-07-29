import { describe, expect, it } from 'vitest'
import {
  planOfficialMetadataCascade,
  sameListDate,
  sameListNumeric,
  sameListText,
  summarizeCascadeCounts,
} from './loteMetadataCascade'

describe('loteMetadataCascade helpers', () => {
  it('compares numeric/text/date list defaults', () => {
    expect(sameListNumeric(1.7, '1.7')).toBe(true)
    expect(sameListNumeric(2, 2.1)).toBe(false)
    expect(sameListText(' MG ', 'MG')).toBe(true)
    expect(sameListDate('2026-07-01T00:00:00', '2026-07-01')).toBe(true)
  })

  it('plans only changed fields for official cascade', () => {
    const previous = {
      data_validade: '2026-09-30',
      quarter_calculado: 'Q3 2026',
      desconto_usd: 10,
      estado_padrao: 'MG',
      taxa_antecipacao: 1.7,
      taxa_juros: 2,
    }

    const ops = planOfficialMetadataCascade(previous, {
      desconto_usd: 12,
      estado_padrao: 'SP',
      taxa_antecipacao: 1.7,
      taxa_juros: 2.5,
      quarter_calculado: 'Q3 2026',
    })

    expect(ops.map((op) => op.key)).toEqual([
      'desconto',
      'estado',
      'taxa_juros',
    ])
    expect(ops.find((op) => op.key === 'desconto')).toMatchObject({
      kind: 'desconto',
      oldValue: 10,
      newValue: 12,
    })
    expect(ops.find((op) => op.key === 'estado')).toMatchObject({
      productColumn: 'estado',
      oldValue: 'MG',
      newValue: 'SP',
    })
  })

  it('skips empty quarter/estado targets', () => {
    const ops = planOfficialMetadataCascade(
      { quarter_calculado: 'Q1 2026', estado_padrao: 'MG' },
      { quarter_calculado: '  ', estado_padrao: null },
    )
    expect(ops).toEqual([])
  })

  it('summarizes cascade update counts', () => {
    expect(
      summarizeCascadeCounts([
        { key: 'desconto', updated: 3 },
        { key: 'estado', updated: 1 },
      ]),
    ).toEqual({
      counts: { desconto: 3, estado: 1 },
      updatedCount: 4,
    })
  })
})
