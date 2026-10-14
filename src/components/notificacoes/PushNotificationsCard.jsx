import { IconBell } from '../icons'
import { Button } from '../ui/Button'
import { usePushNotifications } from '../../push/usePushNotifications'
import { emitNotificationsChanged } from '../../services/notificationService'

const COPY = {
  checking: {
    title: 'Verificando este dispositivo',
    detail: 'Consultando permissão e inscrição de push.',
  },
  activating: {
    title: 'Ativação em andamento',
    detail: 'Aguarde a permissão do navegador e o registro da inscrição.',
  },
  unsupported: {
    title: 'Navegador ou contexto incompatível',
    detail:
      'Este dispositivo não oferece Web Push aqui. Use Chrome no Android ou um navegador atualizado em HTTPS. No computador, Chrome, Edge e Firefox também funcionam.',
  },
  ios_install: {
    title: 'No iPhone e no iPad, instale o app na Tela de Início',
    detail:
      'O push no iOS/iPadOS exige a versão 16.4 ou superior e o Aval aberto pelo ícone da Tela de Início, não pela aba do Safari. No Safari, toque em Compartilhar e em Adicionar à Tela de Início. Depois abra o Aval por esse ícone e ative as notificações aqui.',
  },
  denied: {
    title: 'Permissão negada pelo navegador',
    detail:
      'O sistema não vai pedir de novo enquanto a permissão estiver bloqueada. No computador, abra o cadeado na barra de endereço, escolha Notificações e permita. No iPhone, vá em Ajustes, Notificações, Aval, e ative as notificações. Depois atualize esta página.',
  },
  error: {
    title: 'Erro ao registrar ou salvar a inscrição',
    detail: 'A notificação interna não foi afetada. Tente ativar novamente.',
  },
  active: {
    title: 'Notificações ativadas neste dispositivo',
    detail:
      'A permissão do navegador está concedida e a inscrição push foi salva na sua conta. As notificações do Aval chegam pelo sistema do aparelho mesmo com a página fechada, quando houver conexão.',
  },
  idle: {
    title: 'Ative as notificações neste dispositivo',
    detail:
      'As mensagens continuam nesta tela. Se você ativar, o mesmo aviso também pode aparecer no sistema do celular ou do computador. A permissão só é pedida quando você tocar no botão.',
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
          {displayStatus === 'idle' || displayStatus === 'error' || displayStatus === 'activating' ? (
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
