import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogisticaKanbanBoard } from '../../components/logistica/LogisticaKanbanBoard'
import { ModalProgramarEntrega } from '../../components/logistica/ModalProgramarEntrega'
import { IconRotateCw, IconSearch, IconTruck } from '../../components/icons'
import { AlertMessage } from '../../components/ui/AlertMessage'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageInfoBanner } from '../../components/ui/InfoStatCard'
import { SearchInput } from '../../components/ui/SearchInput'
import {
  aplicarPendenciasLogistica,
  montarCartoesLogistica,
  motivoBloqueioMovimento,
  moverStatusLogistica,
} from '../../constants/logisticaProgramacao'
import {
  STATUS_LOGISTICA_ENTREGUE,
  normalizeStatusLogistica,
} from '../../constants/logisticaStatus'
import { useSyncPageLoading } from '../../contexts/PageLoadingContext'
import { useAbortableAsync } from '../../hooks/useAbortableAsync'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { usePersistedFilters } from '../../hooks/usePersistedFilters'
import {
  atualizarStatusLogistica,
  fetchPedidosLogistica,
  programarEntregaLogistica,
} from '../../services/logisticaService'

export function LogisticaPedidosPage() {
  const navigate = useNavigate()
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [movingId, setMovingId] = useState(null)
  const [moveError, setMoveError] = useState(null)
  const [programacao, setProgramacao] = useState(null)
  const [savingProgramacao, setSavingProgramacao] = useState(false)
  const movingLock = useRef(false)
  const pendingMovesRef = useRef(new Map())
  const fetchGen = useRef(0)
  const searchRef = useRef('')
  const [filters, , patchFilters] = usePersistedFilters(
    'filters:logistica-pedidos',
    { searchQuery: '' },
  )
  const { searchQuery } = filters
  const debouncedSearch = useDebouncedValue(searchQuery, 300)

  useSyncPageLoading(loading)

  async function carregar({ silent = false, isActive = () => true } = {}) {
    const gen = ++fetchGen.current
    const busca = searchRef.current
    if (!silent) setLoading(true)
    setError(null)
    const res = await fetchPedidosLogistica({ search: busca })
    if (!isActive() || gen !== fetchGen.current) return res
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return res
    }
    const reconciled = aplicarPendenciasLogistica(res.data, pendingMovesRef.current)
    pendingMovesRef.current = reconciled.pending
    setPedidos(reconciled.rows)
    return res
  }

  useAbortableAsync(
    async (_signal, isActive) => {
      searchRef.current = debouncedSearch
      await carregar({ isActive })
    },
    [debouncedSearch, reloadToken],
  )

  const cards = useMemo(() => montarCartoesLogistica(pedidos), [pedidos])
  const hasFilters = Boolean(searchQuery.trim())
  const bannerText = useMemo(() => {
    if (loading && cards.length === 0) return 'Carregando pedidos…'
    if (hasFilters) return `${cards.length} cartão(ões) encontrado(s).`
    const abertos = cards.filter(
      (row) => normalizeStatusLogistica(row.statusLogistica) !== STATUS_LOGISTICA_ENTREGUE,
    ).length
    return `${cards.length} cartão(ões) · ${abertos} em aberto.`
  }, [loading, hasFilters, cards])

  function pedidoDoCard(card) {
    return pedidos.find((pedido) => pedido.simulationId === card?.simulationId) ?? null
  }

  async function movePedido(card, nextStatus) {
    const bloqueio = motivoBloqueioMovimento(card, nextStatus)
    if (!card?.simulationId || bloqueio === 'igual' || movingLock.current) return
    if (bloqueio === 'programar') {
      setMoveError(null)
      setProgramacao(card)
      return
    }
    if (bloqueio) {
      setMoveError({ message: bloqueio })
      return
    }

    const pedido = pedidoDoCard(card)
    if (!pedido) return
    const expected = normalizeStatusLogistica(card.statusLogistica)
    const anterior = pedidos
    const movido = moverStatusLogistica(pedido, {
      cardId: card.cardId,
      status: nextStatus,
    })
    if (!movido.ok) {
      setMoveError({ message: movido.error || 'Não foi possível mover o pedido.' })
      return
    }

    const agora = new Date().toISOString()
    movingLock.current = true
    setMovingId(card.cardId)
    setMoveError(null)
    pendingMovesRef.current.set(card.cardId, {
      statusLogistica: nextStatus,
      statusLogisticaEm: agora,
    })
    setPedidos((current) =>
      current.map((item) =>
        item.simulationId === pedido.simulationId ? movido.pedido : item,
      ),
    )

    const res = await atualizarStatusLogistica({
      simulationId: card.simulationId,
      status: nextStatus,
      statusEsperado: expected,
      entregaId: card.entregaId,
    })

    if (!res.ok) {
      pendingMovesRef.current.delete(card.cardId)
      setPedidos(anterior)
      movingLock.current = false
      setMovingId(null)
      setMoveError({
        message: res.error || 'Não foi possível salvar o status.',
        card,
        nextStatus,
      })
      return
    }

    movingLock.current = false
    setMovingId(null)
    await carregar({ silent: true })
  }

  async function confirmarProgramacao({ linhas, idempotencyKey }) {
    const card = programacao
    if (!card || savingProgramacao || movingLock.current) {
      return { ok: false, ignored: true }
    }
    movingLock.current = true
    setSavingProgramacao(true)
    setMovingId(card.cardId)
    setMoveError(null)

    const res = await programarEntregaLogistica({
      simulationId: card.simulationId,
      linhas,
      idempotencyKey,
    })

    if (!res.ok) {
      movingLock.current = false
      setSavingProgramacao(false)
      setMovingId(null)
      return res
    }

    setProgramacao(null)
    await carregar({ silent: true })
    movingLock.current = false
    setSavingProgramacao(false)
    setMovingId(null)
    return res
  }

  function retryMove() {
    if (!moveError?.card || !moveError.nextStatus) {
      setReloadToken((token) => token + 1)
      return
    }
    const card = cards.find((item) => item.cardId === moveError.card.cardId) ?? moveError.card
    void movePedido(card, moveError.nextStatus)
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-emerald-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <PageHeader
          eyebrow="Logística"
          title="Pedidos"
          description="Carteira, programação e entrega. O status comercial do pedido não muda ao mover o cartão."
          className="relative mb-0"
          actions={
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={loading || Boolean(movingId)}
              onClick={() => setReloadToken((token) => token + 1)}
            >
              <IconRotateCw className="size-4" />
              Atualizar
            </Button>
          }
        />
        <PageInfoBanner icon={IconTruck}>{bannerText}</PageInfoBanner>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
        <div className="flex items-center gap-2">
          <IconSearch className="hidden size-4 text-slate-400 sm:block" />
          <SearchInput
            value={searchQuery}
            onChange={(event) => patchFilters({ searchQuery: event.target.value })}
            placeholder="Buscar por cliente, fazenda, município ou item…"
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Arraste o topo do cartão ou use o seletor. Da Carteira para Programado, escolha a quantidade.
        </p>
      </div>

      {error ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <AlertMessage className="flex-1">{error}</AlertMessage>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {moveError ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <AlertMessage className="flex-1">{moveError.message}</AlertMessage>
          {moveError.card ? (
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(movingId)}
              onClick={retryMove}
            >
              Tentar novamente
            </Button>
          ) : null}
        </div>
      ) : null}

      {loading && cards.length === 0 ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Carregando…
        </section>
      ) : error && cards.length === 0 ? null : cards.length === 0 ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-10">
          <EmptyState
            title={
              hasFilters
                ? 'Nenhum resultado para a busca.'
                : 'Nenhum pedido com dados completos ainda.'
            }
          />
        </section>
      ) : (
        <LogisticaKanbanBoard
          rows={cards}
          movingId={movingId}
          onMove={(row, status) => {
            void movePedido(row, status)
          }}
          onOpen={(simulationId) => navigate(`/logistica/${simulationId}`)}
        />
      )}

      <ModalProgramarEntrega
        open={Boolean(programacao)}
        pedido={programacao}
        saving={savingProgramacao}
        onClose={() => {
          if (!savingProgramacao) setProgramacao(null)
        }}
        onConfirm={confirmarProgramacao}
      />
    </div>
  )
}
