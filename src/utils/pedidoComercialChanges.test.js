import { describe, expect, it } from 'vitest'
import { hasNotifiablePedidoComercialChanges } from './pedidoComercialChanges'

const item = {
  id: 'a',
  product_id: 'p1',
  volume: 10,
  cultura: 'Soja',
  proposta: 100,
  override_custo_usd: null,
  override_desconto_usd: null,
  override_taxa: null,
  override_frete: null,
  override_taxa_antecipacao: null,
  override_taxa_juros: null,
}

const line = {
  id: 'a',
  productId: 'p1',
  volume: 10,
  cultura: 'Soja',
  proposta: 100,
  overrides: undefined,
}

describe('hasNotifiablePedidoComercialChanges', () => {
  it('não notifica quando só parâmetros mudam (mesmo com proposta recalculada)', () => {
    expect(
      hasNotifiablePedidoComercialChanges(
        [item],
        [
          {
            ...line,
            proposta: 108,
            overrides: { taxa: 5.8, custoUsd: 210 },
          },
        ],
      ),
    ).toBe(false)
  })

  it('notifica alteração de volume', () => {
    expect(
      hasNotifiablePedidoComercialChanges([item], [{ ...line, volume: 12 }]),
    ).toBe(true)
  })

  it('notifica troca de produto', () => {
    expect(
      hasNotifiablePedidoComercialChanges(
        [item],
        [{ ...line, productId: 'p2' }],
      ),
    ).toBe(true)
  })

  it('notifica inclusão ou remoção de linha', () => {
    expect(
      hasNotifiablePedidoComercialChanges(
        [item],
        [line, { ...line, id: 'b', productId: 'p2' }],
      ),
    ).toBe(true)
    expect(hasNotifiablePedidoComercialChanges([item], [])).toBe(true)
  })

  it('notifica proposta alterada sem mudança de parâmetros', () => {
    expect(
      hasNotifiablePedidoComercialChanges(
        [item],
        [{ ...line, proposta: 90 }],
      ),
    ).toBe(true)
  })

  it('notifica mudança de cultura', () => {
    expect(
      hasNotifiablePedidoComercialChanges(
        [item],
        [{ ...line, cultura: 'Milho' }],
      ),
    ).toBe(true)
  })
})
