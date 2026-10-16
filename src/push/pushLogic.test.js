import { describe, expect, it } from 'vitest'
import {
  absoluteAppUrl,
  buildPushPayload,
  canClaimDelivery,
  deliveryResultPatch,
  notificationTargetPath,
  pushDisplayFromPayload,
  safeNotificationPath,
  urlWithinAppScope,
} from '../../supabase/functions/enviar-push-notificacao/pushLogic.js'
import {
  deviceLabelFromUserAgent,
  isIosUserAgent,
  normalizeSubscription,
  resolvePushStatus,
  urlBase64ToUint8Array,
} from './pushStatus'

const SIM = '11111111-2222-4333-8444-555555555555'

describe('destino da notificação', () => {
  it('segue o mesmo caminho da tela interna', () => {
    expect(notificationTargetPath({ type: 'order_approved', simulationId: SIM, role: 'consultor' }))
      .toBe(`/pedido/${SIM}`)
    expect(notificationTargetPath({ type: 'pedido_fields_updated', simulationId: SIM, role: 'consultor' }))
      .toBe(`/pedido/${SIM}`)
    expect(notificationTargetPath({ type: 'simulation_gestor_updated', simulationId: SIM, role: 'consultor' }))
      .toBe(`/simulador?simulationId=${SIM}`)
    expect(notificationTargetPath({ type: 'order_approval_request', simulationId: SIM, role: 'gestor' }))
      .toBe(`/pedido/${SIM}`)
    expect(notificationTargetPath({ type: 'order_approval_request', simulationId: SIM, role: 'consultor' }))
      .toBe(`/simulador?simulationId=${SIM}`)
    expect(notificationTargetPath({ type: 'order_conversion_request', simulationId: SIM, role: 'gestor' }))
      .toBe(`/simulador?simulationId=${SIM}`)
    expect(notificationTargetPath({ type: 'order_rejected', simulationId: SIM, role: 'gestor' }))
      .toBe(`/pedido/${SIM}`)
    expect(notificationTargetPath({ type: 'order_rejected', simulationId: SIM, role: 'consultor' }))
      .toBe('/pedidos')
    expect(notificationTargetPath({ type: 'approval_request', simulationId: SIM, role: 'gestor' }))
      .toBe(`/simulador?simulationId=${SIM}`)
    expect(notificationTargetPath({ type: 'push_test', simulationId: null, role: 'gestor' }))
      .toBe('/notificacoes')
  })

  it('codifica um identificador hostil dentro do caminho', () => {
    expect(notificationTargetPath({
      type: 'order_approved',
      simulationId: 'https://evil.example/phish',
      role: 'gestor',
    })).toBe('/pedido/https%3A%2F%2Fevil.example%2Fphish')
  })
})

describe('caminho seguro do clique', () => {
  it('aceita caminho interno e rejeita redirecionamento', () => {
    expect(safeNotificationPath('/pedido/abc?x=1#topo')).toBe('/pedido/abc?x=1#topo')
    expect(safeNotificationPath('https://evil.example')).toBe('/notificacoes')
    expect(safeNotificationPath('//evil.example')).toBe('/notificacoes')
    expect(safeNotificationPath('/\\evil')).toBe('/notificacoes')
    expect(safeNotificationPath('/pedido\nid')).toBe('/notificacoes')
    expect(safeNotificationPath('pedido/1')).toBe('/notificacoes')
  })

  it('mantém o destino dentro do escopo do app', () => {
    expect(urlWithinAppScope('/pedido/1', 'https://aval.example/')).toBe('https://aval.example/pedido/1')
    expect(urlWithinAppScope('/pedido/1', 'https://aval.example/Syagri/')).toBe(
      'https://aval.example/Syagri/pedido/1',
    )
    expect(urlWithinAppScope('https://evil.example', 'https://aval.example/')).toBe(
      'https://aval.example/notificacoes',
    )
  })
})

describe('payload e duplicidade', () => {
  it('limita o texto e descarta id inválido', () => {
    const payload = buildPushPayload({
      title: 'A'.repeat(200),
      body: 'linha\ncom quebra',
      notificationId: 'nao-e-uuid',
      url: 'https://evil.example',
    })
    expect(payload.title.endsWith('…')).toBe(true)
    expect(payload.title.length).toBeLessThanOrEqual(120)
    expect(payload.body).not.toContain('\n')
    expect(payload.notificationId).toBeNull()
    expect(payload.url).toBe('/notificacoes')
    expect(payload.web_push).toBe(8030)
    expect(payload.notification.navigate).toBe('https://aval-fertilizantes.online/notificacoes')
    expect(payload.notification.title).toBe(payload.title)
    expect(payload.notification.tag).toBeUndefined()
  })

  it('aponta o push declarativo para a origem configurada', () => {
    const payload = buildPushPayload({
      title: 'Pedido aprovado',
      body: 'O gestor aprovou.',
      notificationId: SIM,
      url: `/pedido/${SIM}`,
      appOrigin: 'https://app.exemplo.com.br/',
    })
    expect(payload.notification.navigate).toBe(`https://app.exemplo.com.br/pedido/${SIM}`)
    expect(payload.notification.tag).toBe(`aval-${SIM}`)
    expect(absoluteAppUrl('https://evil.example', 'https://app.exemplo.com.br')).toBe(
      'https://app.exemplo.com.br/notificacoes',
    )
  })

  it('o service worker revalida o payload', () => {
    const display = pushDisplayFromPayload({
      title: 'Pedido aprovado',
      body: 'O gestor aprovou.',
      notificationId: SIM,
      url: '/pedido/1',
    })
    expect(display).toMatchObject({
      title: 'Pedido aprovado',
      notificationId: SIM,
      url: '/pedido/1',
    })
    const declarative = pushDisplayFromPayload(buildPushPayload({
      title: 'Pedido aprovado',
      body: 'O gestor aprovou.',
      notificationId: SIM,
      url: '/pedido/1',
      appOrigin: 'https://aval-fertilizantes.online',
    }))
    expect(declarative).toMatchObject({
      title: 'Pedido aprovado',
      notificationId: SIM,
      url: '/pedido/1',
    })
  })

  it('não reenvia entrega concluída e recupera processamento preso', () => {
    const now = Date.parse('2026-10-09T15:00:00Z')
    expect(canClaimDelivery({
      status: 'sent',
      attempts: 1,
      next_attempt_at: '2026-10-09T14:00:00Z',
    }, now)).toBe(false)
    expect(canClaimDelivery({
      status: 'pending',
      attempts: 0,
      next_attempt_at: '2026-10-09T14:59:00Z',
    }, now)).toBe(true)
    expect(canClaimDelivery({
      status: 'failed',
      attempts: 5,
      next_attempt_at: '2026-10-09T14:00:00Z',
    }, now)).toBe(false)
    expect(canClaimDelivery({
      status: 'processing',
      attempts: 1,
      processing_started_at: '2026-10-09T14:55:00Z',
      next_attempt_at: '2026-10-09T14:00:00Z',
    }, now)).toBe(false)
    expect(canClaimDelivery({
      status: 'processing',
      attempts: 1,
      processing_started_at: '2026-10-09T14:00:00Z',
      next_attempt_at: '2026-10-09T14:00:00Z',
    }, now)).toBe(true)
  })

  it('agenda nova tentativa só enquanto não esgota o limite', () => {
    const now = Date.parse('2026-10-09T15:00:00Z')
    const retry = deliveryResultPatch(1, 'failed', 'push_failed:1', now)
    expect(retry.status).toBe('failed')
    expect(Date.parse(retry.next_attempt_at)).toBe(now + 60 * 1000)
    const done = deliveryResultPatch(5, 'failed', 'push_failed:1', now)
    expect(canClaimDelivery({ ...done, attempts: 5 }, now + 60 * 60 * 1000)).toBe(false)
    expect(deliveryResultPatch(1, 'sent', null, now).status).toBe('sent')
    expect(deliveryResultPatch(1, 'skipped', 'no_subscription', now).status).toBe('skipped')
  })
})

describe('inscrição e compatibilidade', () => {
  it('recusa assinatura sem chave ou com endpoint inseguro', () => {
    expect(() => normalizeSubscription('user-1', { endpoint: 'http://inseguro' }, 'Chrome')).toThrow(
      /inválida/,
    )
    expect(() => normalizeSubscription('user-1', {
      endpoint: 'https://push.example/sub',
      keys: { p256dh: 'abc', auth: 'curta' },
    }, 'Chrome')).toThrow(/inválidas/)
  })

  it('associa a assinatura ao usuário informado', () => {
    const row = normalizeSubscription('user-1', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      expirationTime: Date.parse('2026-12-01T00:00:00Z'),
      keys: { p256dh: 'p'.repeat(80), auth: 'a'.repeat(22) },
    }, 'Chrome · Android')
    expect(row.user_id).toBe('user-1')
    expect(row.active).toBe(true)
    expect(row.device_label).toBe('Chrome · Android')
    expect(row.expiration_time).toBe('2026-12-01T00:00:00.000Z')
  })

  it('identifica iOS e rótulo curto do aparelho', () => {
    expect(isIosUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe(true)
    expect(isIosUserAgent('Mozilla/5.0 (Linux; Android 14)', 'Linux', 5)).toBe(false)
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0')).toBe(
      'Chrome · Android',
    )
  })

  it('separa permissão negada, iOS sem instalação e inscrição ativa', () => {
    expect(resolvePushStatus({
      secureContext: true,
      serviceWorker: true,
      notification: true,
      pushManager: false,
      ios: true,
      standalone: false,
      permission: 'default',
    })).toBe('ios_install')
    expect(resolvePushStatus({
      secureContext: false,
      serviceWorker: true,
      notification: true,
      pushManager: true,
      permission: 'default',
    })).toBe('unsupported')
    expect(resolvePushStatus({
      secureContext: true,
      serviceWorker: true,
      notification: true,
      pushManager: true,
      permission: 'denied',
    })).toBe('denied')
    expect(resolvePushStatus({
      secureContext: true,
      serviceWorker: true,
      notification: true,
      pushManager: true,
      permission: 'granted',
      browserSubscription: true,
      serverSubscription: false,
    })).toBe('idle')
    expect(resolvePushStatus({
      secureContext: true,
      serviceWorker: true,
      notification: true,
      pushManager: true,
      permission: 'granted',
      browserSubscription: true,
      serverSubscription: true,
    })).toBe('active')
  })

  it('rejeita chave pública VAPID que não é ponto P-256', () => {
    expect(() => urlBase64ToUint8Array('AAAA')).toThrow(/inválida/)
  })
})
