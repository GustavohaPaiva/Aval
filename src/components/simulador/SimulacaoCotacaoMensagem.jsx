import { useMemo, useState } from 'react'
import { formatPedidoCotacaoMensagem } from '../../utils/formatPedidoCotacaoMensagem'
import { Button } from '../ui/Button'
import {
  SIMULADOR_SECTION_ICONS,
  SimuladorSectionPanel,
} from './SimuladorVisuals'

/**
 * Bloco com a mensagem de cotação em texto + botão copiar (tela de Simulação).
 */
export function SimulacaoCotacaoMensagem({ bundle }) {
  const [copied, setCopied] = useState(false)
  const mensagem = useMemo(
    () => formatPedidoCotacaoMensagem(bundle),
    [bundle],
  )

  async function handleCopy() {
    if (!mensagem) return
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (!mensagem) return null

  return (
    <SimuladorSectionPanel
      icon={SIMULADOR_SECTION_ICONS.cotacao}
      title="Mensagem da cotação"
      description="Texto pronto para enviar ao cliente (WhatsApp / e-mail)."
      gradient="from-primary-50/70 via-white to-sky-50/40"
      actions={
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          onClick={() => void handleCopy()}
        >
          {copied ? 'Copiado!' : 'Copiar mensagem'}
        </Button>
      }
    >
      <textarea
        readOnly
        value={mensagem}
        rows={Math.min(12, mensagem.split('\n').length + 1)}
        className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm leading-relaxed text-slate-800 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
        onFocus={(e) => e.target.select()}
        aria-label="Mensagem da cotação para copiar"
      />
    </SimuladorSectionPanel>
  )
}
