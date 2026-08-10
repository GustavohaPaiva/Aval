import { describe, expect, it } from 'vitest'
import { resolveOrigemFreteByEstado } from './fretes'

describe('resolveOrigemFreteByEstado', () => {
  it('mapeia estados CIF para a origem fixa', () => {
    expect(resolveOrigemFreteByEstado('MG')).toBe('UBERABA')
    expect(resolveOrigemFreteByEstado('SP')).toBe('CUBATAO')
    expect(resolveOrigemFreteByEstado('RS')).toBe('RIO GRANDE')
  })

  it('retorna vazio sem estado ou estado desconhecido', () => {
    expect(resolveOrigemFreteByEstado(null)).toBe('')
    expect(resolveOrigemFreteByEstado('')).toBe('')
    expect(resolveOrigemFreteByEstado('PR')).toBe('')
  })
})
