export const IGNORE_COLUMN_VALUE = '__ignore__'

export const SYSTEM_MAPPING_FIELDS = [
  { value: IGNORE_COLUMN_VALUE, label: 'Ignorar coluna' },
  { value: 'produto', label: 'Fertilizante (produto)' },
  {
    value: 'codigo_produto',
    label: 'Código do produto (SKU)',
  },
  {
    value: 'referencia_complementar',
    label: 'Referência complementar',
  },
  { value: 'preco_custo', label: 'Preço de custo (USD)' },
]

export const REQUIRED_MAPPING_TARGETS = [
  'produto',
  'preco_custo',
]

/** Rótulos amigáveis para mensagens de erro */
export const MAPPING_TARGET_LABELS = Object.fromEntries(
  SYSTEM_MAPPING_FIELDS.filter((f) => f.value !== IGNORE_COLUMN_VALUE).map(
    (f) => [f.value, f.label],
  ),
)

export const ESTADOS_PRODUTO = [
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'SP', label: 'São Paulo' },
  { value: 'RS', label: 'Rio Grande do Sul' },
]

export const CLASSES_PRODUTO = [
  { value: 'Convencional', label: 'Convencional' },
  { value: 'Especial', label: 'Especial' },
]

export function formatProdutoDisplayNome({ nome, referencia_complementar, fornecedor_nome }) {
  const parts = [nome, referencia_complementar, fornecedor_nome].filter(
    (p) => String(p ?? '').trim().length > 0,
  )
  return parts.join(' · ')
}
