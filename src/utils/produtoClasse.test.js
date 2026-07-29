import { describe, expect, it } from 'vitest'
import {
  classifyProdutoClasse,
  PREFIXOS_PRODUTO_ESPECIAL,
} from './produtoClasse'

describe('classifyProdutoClasse', () => {
  it('classifica prefixos Yara como Especial', () => {
    expect(classifyProdutoClasse('YaraBasa 21-00-00')).toBe('Especial')
    expect(classifyProdutoClasse('YaraBasa Full 15-15-15')).toBe('Especial')
    expect(classifyProdutoClasse('YaraMila High N 25-05-05')).toBe('Especial')
    expect(classifyProdutoClasse('YaraMila Triples')).toBe('Especial')
    expect(classifyProdutoClasse('YaraBela')).toBe('Especial')
    expect(classifyProdutoClasse('YaraTera')).toBe('Especial')
    expect(classifyProdutoClasse('YaraLiva')).toBe('Especial')
    expect(classifyProdutoClasse('YaraRega')).toBe('Especial')
  })

  it('classifica prefixos Cibra como Especial', () => {
    expect(classifyProdutoClasse('Basefort Duo')).toBe('Especial')
    expect(classifyProdutoClasse('Basefort S 08-20-10')).toBe('Especial')
    expect(classifyProdutoClasse('Poly4')).toBe('Especial')
    expect(classifyProdutoClasse('Poly4 Duo Granulado')).toBe('Especial')
  })

  it('é case-insensitive e tolera espaços', () => {
    expect(classifyProdutoClasse('YARABASA FULL')).toBe('Especial')
    expect(classifyProdutoClasse('yara basa full')).toBe('Especial')
    expect(classifyProdutoClasse('  Basefort   Duo  ')).toBe('Especial')
    expect(classifyProdutoClasse('POLY 4 DUO')).toBe('Especial')
    expect(classifyProdutoClasse('basefort s')).toBe('Especial')
  })

  it('preferência pelo prefixo mais específico', () => {
    expect(classifyProdutoClasse('YaraBasa Full')).toBe('Especial')
    expect(classifyProdutoClasse('YaraBasa')).toBe('Especial')
    expect(classifyProdutoClasse('Poly4 Duo')).toBe('Especial')
  })

  it('retorna Convencional por padrão', () => {
    expect(classifyProdutoClasse('Ureia')).toBe('Convencional')
    expect(classifyProdutoClasse('MAP 11-52-00')).toBe('Convencional')
    expect(classifyProdutoClasse('KCl')).toBe('Convencional')
    expect(classifyProdutoClasse('')).toBe('Convencional')
    expect(classifyProdutoClasse(null)).toBe('Convencional')
    expect(classifyProdutoClasse('YaraVera')).toBe('Convencional')
    expect(classifyProdutoClasse('Basefort Plus')).toBe('Convencional')
  })

  it('lista de prefixos cobre Yara e Cibra', () => {
    expect(PREFIXOS_PRODUTO_ESPECIAL).toEqual(
      expect.arrayContaining([
        'YaraBasa',
        'YaraBasa Full',
        'Basefort Duo',
        'Poly4',
      ]),
    )
  })
})
