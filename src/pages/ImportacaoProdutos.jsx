import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { IconFileSpreadsheet } from '../components/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ImportacaoStatsBar,
  ImportacaoUploadPanel,
} from '../components/importacao/ImportacaoVisuals'
import { ModalProdutoOficialForm } from '../components/produtos/ModalProdutoOficialForm'
import { AlertMessage } from '../components/ui/AlertMessage'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { PageInfoBanner } from '../components/ui/InfoStatCard'
import { useSyncPageLoading } from '../contexts/PageLoadingContext'
import { useAbortableAsync } from '../hooks/useAbortableAsync'
import {
  fetchFornecedoresAtivos,
  fetchProdutosTotalCount,
  upsertProdutoOficialManual,
} from '../services/produtoImportacaoService'

const ACCEPTED_MIME = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
}

function isAcceptedSpreadsheet(file) {
  const name = file.name.toLowerCase()
  return name.endsWith('.xlsx') || name.endsWith('.csv') || name.endsWith('.xls')
}

export function ImportacaoProdutos() {
  const location = useLocation()
  const navigate = useNavigate()
  const successFromRoute = location.state?.successMessage

  const [fornecedores, setFornecedores] = useState([])
  const [produtosAtivosCount, setProdutosAtivosCount] = useState(0)
  const [loadError, setLoadError] = useState(null)
  const [listLoading, setListLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState(successFromRoute ?? null)
  const [actionError, setActionError] = useState(null)

  const [produtoModalOpen, setProdutoModalOpen] = useState(false)

  useSyncPageLoading(listLoading)

  const loadLists = useCallback(async (isActive) => {
    setListLoading(true)
    setLoadError(null)

    const [fornRes, produtosRes] = await Promise.all([
      fetchFornecedoresAtivos(),
      fetchProdutosTotalCount({ ativo: true }),
    ])

    if (!isActive || isActive()) {
      setListLoading(false)

      if (!fornRes.ok) {
        setLoadError(fornRes.error)
        return
      }
      if (!produtosRes.ok) {
        setLoadError(produtosRes.error)
        return
      }

      setFornecedores(fornRes.rows)
      setProdutosAtivosCount(produtosRes.total)
    }
  }, [])

  useAbortableAsync(
    async (_signal, isActive) => {
      await loadLists(isActive)
    },
    [loadLists],
  )

  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    if (rejectedFiles.length > 0) {
      setLoadError('Envie apenas planilhas .xlsx ou .csv.')
      return
    }
    const file = acceptedFiles[0]
    if (!file || !isAcceptedSpreadsheet(file)) {
      setLoadError('Formato inválido. Use .xlsx ou .csv.')
      return
    }
    setLoadError(null)
    setSuccessMessage(null)
    navigate('/admin/importacao/preview', { state: { file } })
  }, [navigate])

  const { getRootProps, getInputProps, isDragActive, isDragAccept } =
    useDropzone({
      onDrop,
      accept: ACCEPTED_MIME,
      maxFiles: 1,
      multiple: false,
      disabled: listLoading,
    })

  async function handleSaveProduto(payload) {
    setActionError(null)
    if (!payload.fornecedorId) {
      return { ok: false, error: 'Selecione um fornecedor.' }
    }

    const res = await upsertProdutoOficialManual({
      fornecedorId: payload.fornecedorId,
      sku_fornecedor: payload.referencia_complementar,
      referencia_complementar: payload.referencia_complementar,
      nome: payload.nome,
      estado: payload.estado,
      classe: payload.classe,
      quarter: payload.quarter,
      preco_original: payload.preco_original,
      desconto_usd: payload.desconto_usd,
      moeda_origem: payload.moeda_origem,
    })

    if (res.ok) {
      setSuccessMessage('Produto lançado com sucesso.')
      await loadLists()
    }

    return res
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100/80 bg-gradient-to-br from-primary-50/80 via-white to-sky-50/40 p-4 shadow-sm sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary-200/30 blur-3xl sm:-right-10 sm:-top-10 sm:size-40"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-6 left-1/4 size-24 rounded-full bg-sky-200/25 blur-3xl sm:-bottom-8 sm:left-1/3 sm:size-32"
          aria-hidden
        />

        <PageHeader
          eyebrow="Aval"
          title="Lançamento de Produtos"
          description="Envie a planilha do fornecedor — o sistema detecta colunas e fornecedor automaticamente."
          actions={
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => setProdutoModalOpen(true)}
            >
              Lançar produto
            </Button>
          }
          className="relative mb-0"
        />

        <PageInfoBanner icon={IconFileSpreadsheet}>
          {listLoading
            ? 'Carregando dados de importação…'
            : `${produtosAtivosCount} produto(s) ativo(s) no catálogo.`}
        </PageInfoBanner>
      </div>

      {successMessage ? (
        <AlertMessage tone="success" role="status">
          {successMessage}
        </AlertMessage>
      ) : null}

      {loadError ? <AlertMessage>{loadError}</AlertMessage> : null}
      {actionError ? <AlertMessage>{actionError}</AlertMessage> : null}

      <ImportacaoStatsBar
        fornecedoresCount={fornecedores.length}
        produtosCount={produtosAtivosCount}
        loading={listLoading}
      />

      <ImportacaoUploadPanel
        getRootProps={getRootProps}
        getInputProps={getInputProps}
        isDragActive={isDragActive}
        isDragAccept={isDragAccept}
        disabled={listLoading}
      />

      <ModalProdutoOficialForm
        key={produtoModalOpen ? 'produto-open' : 'produto-closed'}
        open={produtoModalOpen}
        onClose={() => setProdutoModalOpen(false)}
        title="Lançar produto"
        fornecedores={fornecedores}
        onSave={handleSaveProduto}
      />
    </div>
  )
}
