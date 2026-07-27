import { describe, expect, it } from 'vitest'
import {
  buildFirstLastUsername,
  isValidDocumentPassword,
  normalizeDocumentDigits,
  uniquifyUsername,
} from './consultantLogin'

describe('consultantLogin', () => {
  it('builds primeiro.ultimo from full name', () => {
    expect(buildFirstLastUsername('Adriano Reis Menezes')).toBe('adriano.menezes')
    expect(buildFirstLastUsername('Stephanye Resende')).toBe('stephanye.resende')
    expect(buildFirstLastUsername('JOÃO VICTOR SILVA BERNANDES')).toBe(
      'joao.bernandes',
    )
  })

  it('normalizes CPF/CNPJ digits and pads numeric spreadsheet values', () => {
    expect(normalizeDocumentDigits('040.295.326-67')).toBe('04029532667')
    expect(normalizeDocumentDigits(5502079880)).toBe('05502079880')
    expect(normalizeDocumentDigits('374.808.748/98')).toBe('37480874898')
    expect(isValidDocumentPassword('04029532667')).toBe(true)
    expect(isValidDocumentPassword('123')).toBe(false)
  })

  it('uniquifies colliding usernames', () => {
    const used = new Set(['jose.silva'])
    expect(uniquifyUsername('jose.silva', used)).toBe('jose.silva2')
    expect(uniquifyUsername('jose.silva', used)).toBe('jose.silva3')
  })
})
