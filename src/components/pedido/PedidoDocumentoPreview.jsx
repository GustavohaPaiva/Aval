import { PedidoPdfDocument } from './PedidoPdfDocument'

/**
 * Pré-visualização HTML do pedido (mesmo layout do PDF).
 * Evita iframe de URL assinada, que o browser não renderiza.
 */
export function PedidoDocumentoPreview({
  bundle,
  vendedorNome,
  className = '',
}) {
  if (!bundle?.simulation || !bundle?.client || !bundle?.items) return null

  return (
    <div
      className={[
        'overflow-auto rounded-2xl border border-slate-200 bg-slate-100',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex min-w-[794px] justify-center p-3">
        <PedidoPdfDocument bundle={bundle} vendedorNome={vendedorNome} />
      </div>
    </div>
  )
}
