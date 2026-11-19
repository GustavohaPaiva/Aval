import { describe, expect, it } from 'vitest'
import {
  classificarFinanceiro,
  calcularSaldo,
  comissaoLiberadaPorQuitacao,
  statusPrincipalFinanceiro,
  validarNovoRecebimento,
  validarRenegociacao,
} from './financeiroSituacao'

const hoje = '2026-11-18'

describe('situação financeira', () => {
  it('classifica pendente, parcial e quitado pelo saldo em centavos', () => {
    expect(
      classificarFinanceiro({
        valorDevido: 100,
        valorRecebido: 0,
        vencimento: '2026-12-01',
        hoje,
      }).pagamento,
    ).toBe('pendente')

    const parcial = classificarFinanceiro({
      valorDevido: 100,
      valorRecebido: 40,
      vencimento: '2026-12-01',
      hoje,
    })
    expect(parcial.pagamento).toBe('parcial')
    expect(parcial.saldo).toBe(60)
    expect(parcial.quitado).toBe(false)

    const quitado = classificarFinanceiro({
      valorDevido: 100,
      valorRecebido: 100,
      vencimento: '2026-12-01',
      hoje,
    })
    expect(quitado.pagamento).toBe('quitado')
    expect(quitado.saldo).toBe(0)
    expect(quitado.quitado).toBe(true)
  })

  it('só quita com 100% do valor devido', () => {
    const quase = classificarFinanceiro({
      valorDevido: 100,
      valorRecebido: 99.99,
      vencimento: '2026-12-01',
      hoje,
    })
    expect(quase.quitado).toBe(false)
    expect(quase.saldo).toBe(0.01)
  })

  it('separa atraso e proximidade do progresso do pagamento', () => {
    expect(
      classificarFinanceiro({
        valorDevido: 100,
        valorRecebido: 10,
        vencimento: '2026-11-10',
        hoje,
      }).situacaoVencimento,
    ).toBe('atrasado')

    expect(
      classificarFinanceiro({
        valorDevido: 100,
        valorRecebido: 0,
        vencimento: '2026-11-18',
        hoje,
      }).situacaoVencimento,
    ).toBe('proximo')

    expect(
      classificarFinanceiro({
        valorDevido: 100,
        valorRecebido: 0,
        vencimento: '2026-11-25',
        hoje,
      }).situacaoVencimento,
    ).toBe('proximo')

    expect(
      classificarFinanceiro({
        valorDevido: 100,
        valorRecebido: 0,
        vencimento: '2026-11-26',
        hoje,
      }).situacaoVencimento,
    ).toBe('no_prazo')

    expect(
      classificarFinanceiro({
        valorDevido: 100,
        valorRecebido: 0,
        vencimento: null,
        hoje,
      }).situacaoVencimento,
    ).toBe('sem_data')
  })

  it('pedido quitado não permanece atrasado', () => {
    const row = classificarFinanceiro({
      valorDevido: 80,
      valorRecebido: 80,
      vencimento: '2026-11-01',
      hoje,
    })
    expect(row.pagamento).toBe('quitado')
    expect(row.situacaoVencimento).toBe('quitado')
  })

  it('ignora recebimento estornado no saldo', () => {
    const saldo = calcularSaldo({
      valorDevido: 100,
      recebimentos: [
        { id: '1', valor: 40, status: 'ativo' },
        { id: '2', valor: 60, status: 'estornado' },
      ],
    })
    expect(saldo.valorRecebido).toBe(40)
    expect(saldo.saldo).toBe(60)
    expect(saldo.quitado).toBe(false)
  })

  it('recusa valor inválido, duplicado e acima do saldo', () => {
    const base = {
      valorDevido: 100,
      recebimentos: [{ idempotencyKey: 'op-1', valor: 40, status: 'ativo' }],
    }
    expect(validarNovoRecebimento({ ...base, valor: 0, idempotencyKey: 'op-2' }).ok).toBe(false)
    expect(validarNovoRecebimento({ ...base, valor: -5, idempotencyKey: 'op-2' }).ok).toBe(false)
    expect(validarNovoRecebimento({ ...base, valor: 70, idempotencyKey: 'op-2' }).error).toMatch(/saldo/i)
    expect(validarNovoRecebimento({ ...base, valor: 10, idempotencyKey: 'op-1' }).duplicado).toBe(true)
    expect(validarNovoRecebimento({ ...base, valor: 60, idempotencyKey: 'op-2' }).ok).toBe(true)
  })

  it('renegociação troca o vencimento e recusa a mesma data', () => {
    expect(
      validarRenegociacao({
        vencimentoAtual: '2026-11-01',
        vencimentoNovo: '2026-11-01',
      }).ok,
    ).toBe(false)

    const troca = validarRenegociacao({
      vencimentoAtual: '2026-11-01',
      vencimentoNovo: '2026-12-15',
    })
    expect(troca.ok).toBe(true)
    expect(troca.vencimentoAnterior).toBe('2026-11-01')

    const antes = classificarFinanceiro({
      valorDevido: 100,
      valorRecebido: 0,
      vencimento: '2026-11-01',
      hoje,
    })
    const depois = classificarFinanceiro({
      valorDevido: 100,
      valorRecebido: 0,
      vencimento: troca.vencimentoNovo,
      hoje,
    })
    expect(antes.situacaoVencimento).toBe('atrasado')
    expect(depois.situacaoVencimento).toBe('no_prazo')
    expect(depois.saldo).toBe(antes.saldo)
  })
})

describe('status principal da tela', () => {
  it('mostra uma situação só e usa 3 dias para a proximidade', () => {
    expect(
      statusPrincipalFinanceiro({
        saldo: 0,
        valorRecebido: 100,
        vencimento: '2026-11-01',
        hoje,
      }),
    ).toBe('quitado')

    expect(
      statusPrincipalFinanceiro({
        pagamento: 'parcial',
        saldo: 40,
        valorRecebido: 60,
        vencimento: '2026-11-10',
        hoje,
      }),
    ).toBe('atrasado')

    expect(
      statusPrincipalFinanceiro({
        pagamento: 'parcial',
        saldo: 10,
        valorRecebido: 90,
        vencimento: '2026-11-18',
        hoje,
      }),
    ).toBe('proximo')

    expect(
      statusPrincipalFinanceiro({
        pagamento: 'pendente',
        saldo: 100,
        valorRecebido: 0,
        vencimento: '2026-11-21',
        hoje,
      }),
    ).toBe('proximo')

    expect(
      statusPrincipalFinanceiro({
        pagamento: 'parcial',
        saldo: 40,
        valorRecebido: 60,
        vencimento: '2026-11-22',
        hoje,
      }),
    ).toBe('parcial')

    expect(
      statusPrincipalFinanceiro({
        pagamento: 'pendente',
        saldo: 100,
        valorRecebido: 0,
        vencimento: '2026-11-22',
        hoje,
      }),
    ).toBe('pendente')

    expect(
      statusPrincipalFinanceiro({
        pagamento: 'pendente',
        saldo: 100,
        valorRecebido: 0,
        vencimento: null,
        hoje,
      }),
    ).toBe('sem_vencimento')
  })
})

describe('liberação de comissão', () => {
  it('libera só com quitação integral de valor devido positivo', () => {
    const parcial = classificarFinanceiro({
      valorDevido: 100,
      valorRecebido: 99,
      vencimento: '2026-12-01',
      hoje,
    })
    const quitado = classificarFinanceiro({
      valorDevido: 100,
      valorRecebido: 100,
      vencimento: '2026-12-01',
      hoje,
    })
    const zerado = classificarFinanceiro({
      valorDevido: 0,
      valorRecebido: 0,
      vencimento: null,
      hoje,
    })

    expect(comissaoLiberadaPorQuitacao(parcial)).toBe(false)
    expect(comissaoLiberadaPorQuitacao(quitado)).toBe(true)
    expect(quitado.comissaoLiberada).toBe(true)
    expect(zerado.quitado).toBe(true)
    expect(comissaoLiberadaPorQuitacao(zerado)).toBe(false)
  })
})
