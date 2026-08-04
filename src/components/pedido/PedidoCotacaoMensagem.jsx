import { useMemo, useState } from 'react'
import { formatPedidoCotacaoMensagem } from '../../utils/formatPedidoCotacaoMensagem'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

/**
 * Bloco com a mensagem de cotação em texto + botão copiar.
 */
export function PedidoCotacaoMensagem({ bundle }) {
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
    <Card className="mb-6 rounded-3xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-primary-800">
          Mensagem da cotação
        </h2>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          onClick={() => void handleCopy()}
        >
          {copied ? 'Copiado!' : 'Copiar mensagem'}
        </Button>
      </div>
      <textarea
        readOnly
        value={mensagem}
        rows={Math.min(12, mensagem.split('\n').length + 1)}
        className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm leading-relaxed text-slate-800 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100"
        onFocus={(e) => e.target.select()}
        aria-label="Mensagem da cotação para copiar"
      />
    </Card>
  )
}
