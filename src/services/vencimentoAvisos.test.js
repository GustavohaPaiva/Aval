import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { notificationTargetPath } from '../../supabase/functions/enviar-push-notificacao/pushLogic.js'
import {
  AVISO_VENCIMENTO_TIPO,
  chaveAviso,
  formatarBrl,
  registrarEnvios,
  selecionarAvisosVencimento,
  textoAvisoVencimento,
} from './vencimentoAvisos'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SIM = '11111111-2222-4333-8444-555555555555'
const OUTRO = '22222222-3333-4444-8555-666666666666'
const CONSULTOR_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CONSULTOR_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const HOJE = '2026-11-19'
const VENCE = '2026-11-22'

function pedido(partial = {}) {
  return {
    simulationId: SIM,
    status: 'converted',
    ativo: true,
    role: 'consultor',
    consultorId: CONSULTOR_A,
    clienteNome: 'Fazenda Sul',
    valorDevido: 1500,
    valorRecebido: 0,
    dataPagamento: VENCE,
    vencimentoTitulo: null,
    ...partial,
  }
}

describe('aviso de vencimento', () => {
  it('avisa o consultor quando o vencimento é exatamente daqui a 3 dias', () => {
    const [aviso] = selecionarAvisosVencimento([pedido()], { hoje: HOJE })
    expect(aviso).toMatchObject({
      simulationId: SIM,
      vencimento: VENCE,
      recipientId: CONSULTOR_A,
      saldo: 1500,
      type: AVISO_VENCIMENTO_TIPO,
      title: 'Pagamento próximo do vencimento',
    })
    expect(aviso.body).toBe(
      'O pedido do cliente Fazenda Sul vence em 3 dias. Saldo pendente: R$ 1.500,00.',
    )
  })

  it('mantém o aviso com pagamento parcial e saldo em aberto', () => {
    const [aviso] = selecionarAvisosVencimento(
      [pedido({ valorRecebido: 400.5 })],
      { hoje: HOJE },
    )
    expect(aviso.saldo).toBe(1099.5)
    expect(aviso.body).toContain('R$ 1.099,50')
  })

  it('não avisa pedido quitado, zerado, inativo ou ainda não convertido', () => {
    const casos = [
      pedido({ valorRecebido: 1500 }),
      pedido({ valorRecebido: 1600 }),
      pedido({ valorDevido: 0 }),
      pedido({ ativo: false }),
      pedido({ status: 'order_pending' }),
      pedido({ status: 'cancelled' }),
      pedido({ dataPagamento: null, vencimentoTitulo: null }),
    ]
    expect(selecionarAvisosVencimento(casos, { hoje: HOJE })).toEqual([])
  })

  it('não gera aviso novo para vencimento atrasado nem para outra distância', () => {
    const casos = [
      pedido({ dataPagamento: '2026-11-18' }),
      pedido({ dataPagamento: HOJE }),
      pedido({ dataPagamento: '2026-11-21' }),
      pedido({ dataPagamento: '2026-11-23' }),
    ]
    expect(selecionarAvisosVencimento(casos, { hoje: HOJE })).toEqual([])
  })

  it('usa a data renegociada e não repete o vencimento antigo', () => {
    const primeiro = selecionarAvisosVencimento([pedido()], { hoje: HOJE })
    expect(primeiro).toHaveLength(1)
    const enviados = registrarEnvios([], primeiro)

    const renegociado = pedido({ vencimentoTitulo: '2026-12-01' })
    expect(selecionarAvisosVencimento([renegociado], { hoje: HOJE, enviados })).toEqual([])

    const [novo] = selecionarAvisosVencimento([renegociado], {
      hoje: '2026-11-28',
      enviados,
    })
    expect(novo.vencimento).toBe('2026-12-01')

    const voltou = pedido({ vencimentoTitulo: VENCE })
    expect(
      selecionarAvisosVencimento([voltou], {
        hoje: HOJE,
        enviados: registrarEnvios(enviados, [novo]),
      }),
    ).toEqual([])
  })

  it('notifica só o consultor responsável no momento da execução', () => {
    expect(
      selecionarAvisosVencimento([pedido({ role: 'gestor' })], { hoje: HOJE }),
    ).toEqual([])
    expect(
      selecionarAvisosVencimento([pedido({ role: 'financeiro' })], { hoje: HOJE }),
    ).toEqual([])

    const [aviso] = selecionarAvisosVencimento(
      [pedido({ consultorId: CONSULTOR_B })],
      { hoje: HOJE },
    )
    expect(aviso.recipientId).toBe(CONSULTOR_B)

    const enviados = [{ simulationId: SIM, vencimento: VENCE, recipientId: CONSULTOR_A }]
    expect(
      selecionarAvisosVencimento([pedido({ consultorId: CONSULTOR_B })], { hoje: HOJE, enviados }),
    ).toEqual([])
  })

  it('não duplica o mesmo vencimento na mesma execução nem na seguinte', () => {
    const repetido = [pedido(), pedido(), pedido({ simulationId: OUTRO, clienteNome: 'Sítio Norte' })]
    const primeira = selecionarAvisosVencimento(repetido, { hoje: HOJE })
    expect(primeira.map((aviso) => aviso.simulationId)).toEqual([SIM, OUTRO])

    const segunda = selecionarAvisosVencimento(repetido, {
      hoje: HOJE,
      enviados: registrarEnvios([], primeira),
    })
    expect(segunda).toEqual([])
    expect(chaveAviso(SIM, VENCE)).toBe(`${SIM}|${VENCE}`)
  })

  it('formata o saldo em reais', () => {
    expect(formatarBrl(0.5)).toBe('R$ 0,50')
    expect(formatarBrl(1000.5)).toBe('R$ 1.000,50')
    expect(formatarBrl(1234567.89)).toBe('R$ 1.234.567,89')
    expect(textoAvisoVencimento({ clienteNome: '  ', saldo: 10 })).toBe(
      'O pedido do cliente — vence em 3 dias. Saldo pendente: R$ 10,00.',
    )
  })

  it('abre o pedido correspondente, sem a tela de lançamento financeiro', () => {
    expect(notificationTargetPath({
      type: AVISO_VENCIMENTO_TIPO,
      simulationId: SIM,
      role: 'consultor',
    })).toBe(`/pedido/${SIM}`)
    expect(notificationTargetPath({
      type: AVISO_VENCIMENTO_TIPO,
      simulationId: SIM,
      role: 'gestor',
    })).toBe(`/pedido/${SIM}`)
  })
})

describe('rotina no banco', () => {
  const sql = readFileSync(
    resolve(root, 'supabase/migrations/20261119123100_avisos_vencimento_financeiro.sql'),
    'utf8',
  )
  const gatilho = readFileSync(
    resolve(root, 'supabase/migrations/20261102134601_push_dispatch_headers.sql'),
    'utf8',
  )
  const envio = readFileSync(
    resolve(root, 'supabase/functions/enviar-push-notificacao/index.ts'),
    'utf8',
  )

  it('reaproveita a notificação interna, o classificador e o cron existente', () => {
    expect(sql).toContain('public.financeiro_classificar(')
    expect(sql).toContain("s.status = 'converted'::public.simulation_status")
    expect(sql).toContain('s.ativo IS TRUE')
    expect(sql).toContain("p.role = 'consultor'::public.user_role")
    expect(sql).toContain('COALESCE(t.vencimento, s.data_pagamento)')
    expect(sql).toContain("timezone('America/Sao_Paulo', now())")
    expect(sql).toContain('v_hoje + 3')
    expect(sql).toContain("(c.situacao ->> 'saldo')::numeric > 0")
    expect(sql).toContain('AND r.status = \'ativo\'')
    expect(sql).toContain('INSERT INTO public.notifications')
    expect(sql).toContain('ON CONFLICT (simulation_id, vencimento) DO NOTHING')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain("'financeiro_aviso_vencimento'")
    expect(sql).toContain("'0 11 * * *'")
    expect(sql).not.toContain('net.http_post')
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.financeiro_classificar')
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.registrar_recebimento')
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.renegociar_vencimento')
  })

  it('uma falha de push não apaga a notificação interna', () => {
    expect(gatilho).toMatch(/EXCEPTION[\s\S]*RETURN NEW/)
    const sendOne = envio.slice(
      envio.indexOf('async function sendOne'),
      envio.indexOf('async function dispatch'),
    )
    expect(sendOne).toContain('outcome: "failed"')
    expect(sendOne).not.toContain('.from("notifications").delete')
    expect(sendOne).not.toContain(".from('notifications').delete")
  })
})
