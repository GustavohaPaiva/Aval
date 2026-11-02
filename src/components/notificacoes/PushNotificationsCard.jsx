import { IconBell } from '../icons'
import { Button } from '../ui/Button'
import { usePushNotifications } from '../../push/usePushNotifications'
import { emitNotificationsChanged } from '../../services/notificationService'

const COPY = {
  checking: {
    title: 'Verificando este dispositivo',
    detail: 'Consultando a permissão e o registro.',
  },
  activating: {
    title: 'Ativando',
    detail: 'Confirme a permissão no navegador.',
  },
  unsupported: {
    title: 'Não disponíveis neste dispositivo',
    detail: 'Este navegador não recebe push. No computador, use Chrome ou Edge. No Android, use o Chrome.',
  },
  ios_install: {
    title: 'Não disponíveis nesta aba',
    detail:
      'No iPhone e no iPad, o push exige iOS 16.4 ou superior e o Aval instalado na Tela de Início. No Safari, use Compartilhar e Adicionar à Tela de Início. Abra pelo ícone e toque em Ativar.',
  },
  denied: {
    title: 'Bloqueadas pelo navegador',
    detail:
      'Libere as notificações nas configurações do site ou em Ajustes, Notificações, Aval. Depois atualize esta página.',
  },
  misconfigured: {
    title: 'Falha de configuração',
    detail: 'O servidor de push não está pronto. Os avisos continuam nesta tela.',
  },
  error: {
    title: 'Falha ao registrar este dispositivo',
    detail: 'Os avisos internos não foram afetados. Tente ativar de novo.',
  },
  active: {
    title: 'Ativadas neste dispositivo',
    detail: 'Os avisos chegam com o Aval aberto, em segundo plano ou fechado, quando houver conexão.',
  },
  idle: {
    title: 'Desativadas neste dispositivo',
    detail: 'Toque em Ativar para receber os avisos aqui. A permissão só é pedida nesse momento.',
  },
}

export function PushNotificationsCard({ onTestCreated }) {
  const push = usePushNotifications()
  const displayStatus = push.busyAction === 'activate' ? 'activating' : push.status
  const copy = COPY[displayStatus] ?? COPY.idle
  const needsFinish =
    displayStatus === 'idle' &&
    push.permission === 'granted' &&
    (!push.browserSubscription || !push.serverSubscription)

  async function handleTest() {
    const result = await push.sendTest()
    if (!result?.ok) return
    emitNotificationsChanged()
    onTestCreated?.()
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm sm:rounded-3xl">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-600 text-white">
            <IconBell className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">
              Notificações do dispositivo
            </p>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">
              {copy.title}
            </h2>
            <p className="text-sm text-slate-600">{copy.detail}</p>
            {needsFinish ? (
              <p className="text-sm text-slate-600">
                A permissão já foi concedida, mas a inscrição push deste
                dispositivo ainda não está salva.
              </p>
            ) : null}
            {push.error ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                {push.error}
              </p>
            ) : null}
            {push.testMessage ? (
              <p className="text-sm text-emerald-800" role="status">
                {push.testMessage}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
          {displayStatus === 'active' ? (
            <>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                loading={push.testing}
                onClick={() => void handleTest()}
              >
                Enviar teste para mim
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                loading={push.busyAction === 'deactivate'}
                onClick={() => void push.deactivate()}
              >
                Desativar neste dispositivo
              </Button>
            </>
          ) : null}
          {displayStatus === 'idle' || displayStatus === 'error' || displayStatus === 'misconfigured' || displayStatus === 'activating' ? (
            <Button
              type="button"
              variant="primary"
              className="w-full sm:w-auto"
              loading={displayStatus === 'activating'}
              onClick={() => void push.activate()}
            >
              {needsFinish ? 'Concluir ativação' : 'Ativar notificações'}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
