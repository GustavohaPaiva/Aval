import { describe, expect, it } from 'vitest'
import {
  ilikeOrClause,
  quotePostgrestValue,
  sanitizeIlikeNeedle,
  stripAccents,
} from './postgrestSearch'

describe('postgrestSearch', () => {
  it('coloca o valor do ILIKE entre aspas para nomes com espaço', () => {
    const clause = ilikeOrClause(['nome', 'cnpj_cpf'], 'Fazenda Silva')
    expect(clause).toBe(
      'nome.ilike."%Fazenda Silva%",cnpj_cpf.ilike."%Fazenda Silva%"',
    )
  })

  it('inclui variante sem acento', () => {
    const clause = ilikeOrClause(['nome'], 'Márcio')
    expect(clause).toBe('nome.ilike."%Márcio%",nome.ilike."%Marcio%"')
  })

  it('não duplica quando o texto já está sem acento', () => {
    expect(ilikeOrClause(['nome'], 'Marcio')).toBe('nome.ilike."%Marcio%"')
  })

  it('sanitiza curingas e vírgulas do parser', () => {
    expect(sanitizeIlikeNeedle('Silva, João%')).toBe('Silva João')
    expect(stripAccents('José')).toBe('Jose')
    expect(quotePostgrestValue('%abc%')).toBe('"%abc%"')
  })

  it('retorna null para busca vazia', () => {
    expect(ilikeOrClause(['nome'], '   ')).toBeNull()
  })
})
