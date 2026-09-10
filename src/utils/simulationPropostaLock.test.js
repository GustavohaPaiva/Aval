import { describe, expect, it } from 'vitest'
import {
  calcDescontoPct,
  isPropostaTravada,
  resolvePropostaTravadaEm,
  syncLineOnTableChange,
} from './simulationPropostaLock'

const baseLine = {
  id: '1',
  productId: 'p1',
  proposta: 190,
  descontoPct: 5,
}

describe('isPropostaTravada', () => {
  it('trava por timestamp mesmo em rascunho', () => {
    expect(
      isPropostaTravada({
        status: 'draft',
        proposta_travada_em: '2026-09-09T12:00:00Z',
      }),
    ).toBe(true)
  })

  it('trava legado já enviado (pending/approved) sem timestamp', () => {
    expect(isPropostaTravada({ status: 'pending' })).toBe(true)
    expect(isPropostaTravada({ status: 'approved' })).toBe(true)
    expect(isPropostaTravada({ status: 'rejected' })).toBe(true)
  })

  it('não trava rascunho inédito', () => {
    expect(isPropostaTravada({ status: 'draft' })).toBe(false)
    expect(isPropostaTravada(null)).toBe(false)
  })
})

describe('resolvePropostaTravadaEm', () => {
  it('preserva timestamp já gravado', () => {
    expect(
      resolvePropostaTravadaEm('draft', {
        status: 'draft',
        proposta_travada_em: '2026-09-01T00:00:00Z',
      }),
    ).toBe('2026-09-01T00:00:00Z')
  })

  it('grava ao sair de rascunho', () => {
    const at = resolvePropostaTravadaEm('pending', { status: 'draft' })
    expect(at).toBeTruthy()
  })

  it('não trava rascunho novo', () => {
    expect(resolvePropostaTravadaEm('draft', null)).toBeNull()
    expect(resolvePropostaTravadaEm('draft', { status: 'draft' })).toBeNull()
  })
})

describe('syncLineOnTableChange', () => {
  it('sem lock: proposta acompanha o % quando a tabela (dólar) muda', () => {
    const next = syncLineOnTableChange(baseLine, {
      precoUnitario: 220,
      floorUnit: 200,
      canOverrideFloor: false,
      lockProposta: false,
    })
    expect(next.descontoPct).toBe(5)
    expect(next.proposta).toBe(209)
  })

  it('com lock: dólar/tabela não muda a proposta; só o %', () => {
    const next = syncLineOnTableChange(baseLine, {
      precoUnitario: 220,
      floorUnit: 150,
      canOverrideFloor: false,
      lockProposta: true,
    })
    expect(next.proposta).toBe(190)
    expect(next.descontoPct).toBeCloseTo(calcDescontoPct(220, 190), 6)
  })

  it('com lock: edição posterior continua sendo o valor absoluto da linha', () => {
    const edited = { ...baseLine, proposta: 175, descontoPct: 10 }
    const next = syncLineOnTableChange(edited, {
      precoUnitario: 250,
      floorUnit: 180,
      canOverrideFloor: true,
      lockProposta: true,
    })
    expect(next.proposta).toBe(175)
    expect(next.descontoPct).toBeCloseTo(calcDescontoPct(250, 175), 6)
  })
})
