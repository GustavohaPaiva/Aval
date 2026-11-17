import { describe, expect, it } from 'vitest'
import { filialVendaForProfile, normalizeFilialCode } from './filialCodigo'

describe('código de filial', () => {
  it('normaliza os códigos já usados no cadastro', () => {
    expect(normalizeFilialCode('UBERABA')).toBe('uberaba')
    expect(normalizeFilialCode('Filial Uberaba')).toBe('uberaba')
    expect(normalizeFilialCode('NOVA PONTE')).toBe('nova-ponte')
    expect(normalizeFilialCode('GUAÍRA')).toBe('guaira')
    expect(normalizeFilialCode('ITUVERAVA')).toBe('ituverava')
    expect(normalizeFilialCode('FRUTAL')).toBe('frutal')
    expect(normalizeFilialCode('uberaba')).toBe('uberaba')
  })

  it('não apaga um código desconhecido', () => {
    expect(normalizeFilialCode('  Praça nova  ')).toBe('Praça nova')
    expect(normalizeFilialCode('')).toBeNull()
    expect(normalizeFilialCode(null)).toBeNull()
  })

  it('define a filial da venda pelo perfil e fixa o gestor em Uberaba', () => {
    expect(filialVendaForProfile({ role: 'consultor', filial: 'FRUTAL' })).toBe('frutal')
    expect(filialVendaForProfile({ role: 'gestor', filial: 'FRUTAL' })).toBe('uberaba')
    expect(filialVendaForProfile({ role: 'gestor', filial: null })).toBe('uberaba')
    expect(filialVendaForProfile({ role: 'consultor', filial: null })).toBeNull()
  })
})
