import { SYAGRI_COMPANY } from '../../constants/company'

function freightLabel(tipo) {
  if (tipo === 'CIF') return 'CIF — Posto Fazenda'
  if (tipo === 'FOB') return 'FOB — Cliente Retira'
  return '—'
}

function formatDateBr(isoOrDate) {
  if (!isoOrDate) return '—'
  const d = new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDocNumber(id) {
  if (!id) return '—'
  const digits = String(id).replace(/\D/g, '')
  if (digits.length >= 5) return digits.slice(-5).toUpperCase()
  return String(id).slice(0, 8).toUpperCase()
}

function formatVolume(volume) {
  const n = Number(volume)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
}

function productRef(product) {
  if (!product) return '—'
  const ref =
    product.referencia_complementar?.trim() ||
    product.sku_fornecedor?.trim() ||
    ''
  return ref || '—'
}

function buildDeliveryAddress(client, complemento) {
  const parts = [
    client?.logradouro,
    client?.bairro,
    client?.municipio && client?.uf
      ? `${client.municipio} / ${client.uf}`
      : client?.municipio || client?.uf,
    client?.cep ? `CEP ${client.cep}` : null,
    complemento?.trim() || null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * PDF enxuto para cotação com o fornecedor (sem preços).
 * Visual alinhado ao PedidoPdfDocument (verde do sistema).
 */
export function PedidoFornecedorPdfDocument({
  bundle,
  vendedorNome,
  delivery = {},
}) {
  const { simulation, client, items } = bundle
  const docNo = formatDocNumber(simulation.id)
  const deliveryAddress = buildDeliveryAddress(client, delivery.complemento)
  const municipioUf =
    [simulation.pedido_municipio, simulation.pedido_uf].filter(Boolean).join(' / ') ||
    [client?.municipio, client?.uf].filter(Boolean).join(' / ') ||
    '—'
  const prazoLabel = simulation.prazo_dias
    ? `${simulation.prazo_dias} dias`
    : '14 dias'

  const grouped = groupItemsByFornecedor(items)

  return (
    <div
      className="pedido-pdf-root box-border bg-white text-slate-900"
      style={{
        width: '794px',
        fontFamily:
          '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #065f46 0%, #047857 45%, #064e3b 100%)',
          padding: '28px 32px 24px',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
              }}
            >
              {SYAGRI_COMPANY.brandName}
              <span style={{ fontWeight: 500, opacity: 0.9 }}>
                {' '}
                {SYAGRI_COMPANY.brandTagline}
              </span>
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 10,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                opacity: 0.85,
                maxWidth: 420,
                lineHeight: 1.4,
              }}
            >
              {SYAGRI_COMPANY.legalName}
            </p>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                opacity: 0.75,
              }}
            >
              Cotação · Fornecedor
            </p>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                color: '#a7f3d0',
                lineHeight: 1,
              }}
            >
              Nº {docNo}
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 10,
          }}
        >
          {SYAGRI_COMPANY.sites.map((site) => (
            <div
              key={`${site.label}-${site.city}`}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  opacity: 0.7,
                }}
              >
                {site.label} · {site.city}
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 9.5,
                  lineHeight: 1.35,
                  opacity: 0.92,
                }}
              >
                {site.address}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 9.5, opacity: 0.85 }}>
                CEP {site.cep} · {site.phone}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '22px 32px 28px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            marginBottom: 18,
          }}
        >
          {[
            { label: 'Data', value: formatDateBr(simulation.created_at) },
            { label: 'Responsável', value: vendedorNome || '—' },
            { label: 'Prazo', value: prazoLabel },
            { label: 'Frete', value: freightLabel(simulation.tipo_frete) },
            { label: 'Fazenda', value: simulation.fazenda?.trim() || '—' },
            { label: 'Município / UF', value: municipioUf },
          ].map((field) => (
            <div
              key={field.label}
              style={{
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                padding: '10px 12px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#64748b',
                }}
              >
                {field.label}
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#0f172a',
                }}
              >
                {field.value}
              </p>
            </div>
          ))}
        </div>

        <p
          style={{
            margin: '0 0 16px',
            fontSize: 11,
            lineHeight: 1.45,
            color: '#475569',
          }}
        >
          Solicitação de cotação dos itens abaixo para o fornecedor.
        </p>

        {(deliveryAddress || simulation.destino_frete || simulation.origem_frete) && (
          <section
            style={{
              borderRadius: 14,
              border: '1px solid #d1fae5',
              background: 'linear-gradient(180deg, #ecfdf5 0%, #ffffff 55%)',
              padding: '12px 14px',
              marginBottom: 18,
            }}
          >
            <p
              style={{
                margin: '0 0 6px',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#047857',
              }}
            >
              Entrega / destino
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: '#0f172a' }}>
              {deliveryAddress ||
                (simulation.destino_frete
                  ? `Destino: ${simulation.destino_frete}`
                  : 'A definir.')}
            </p>
            {simulation.origem_frete ? (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>
                Origem do frete: {simulation.origem_frete}
              </p>
            ) : null}
          </section>
        )}

        {grouped.map((group) => (
          <section key={group.fornecedor} style={{ marginBottom: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#047857',
                }}
              >
                Fornecedor · {group.fornecedor}
              </p>
              {simulation.quarter ? (
                <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                  Lista / Quarter:{' '}
                  <strong style={{ color: '#0f172a' }}>{simulation.quarter}</strong>
                </p>
              ) : null}
            </div>

            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 11,
                overflow: 'hidden',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
              }}
            >
              <thead>
                <tr style={{ background: '#064e3b', color: '#fff' }}>
                  <Th w={36}>Item</Th>
                  <Th align="right" w={72}>
                    Qtd.
                  </Th>
                  <Th>Produto</Th>
                  <Th w={180}>Referência / SKU</Th>
                  <Th w={56}>UF</Th>
                  <Th w={110}>Classe</Th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item, index) => {
                  const zebra = index % 2 === 1
                  const p = item.product
                  return (
                    <tr
                      key={item.id}
                      style={{ background: zebra ? '#f8fafc' : '#ffffff' }}
                    >
                      <Td align="center" muted>
                        {index + 1}
                      </Td>
                      <Td align="right" mono>
                        {formatVolume(item.volume)}
                      </Td>
                      <Td strong>{p?.nome ?? '—'}</Td>
                      <Td mono muted>
                        {productRef(p)}
                      </Td>
                      <Td>{p?.estado || '—'}</Td>
                      <Td>{p?.classe || '—'}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        ))}

        <section
          style={{
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            padding: '12px 14px',
            marginBottom: 16,
            minHeight: 64,
          }}
        >
          <p
            style={{
              margin: '0 0 6px',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#64748b',
            }}
          >
            Observações
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.5,
              color: simulation.observacoes ? '#0f172a' : '#94a3b8',
              whiteSpace: 'pre-wrap',
            }}
          >
            {simulation.observacoes?.trim() || 'Sem observações adicionais.'}
          </p>
        </section>

        <p
          style={{
            margin: 0,
            textAlign: 'center',
            fontSize: 9,
            color: '#94a3b8',
            letterSpacing: '0.02em',
          }}
        >
          Documento gerado pela {SYAGRI_COMPANY.brandName} · Cotação nº {docNo} ·{' '}
          {formatDateBr(new Date().toISOString())}
        </p>
      </div>
    </div>
  )
}

function groupItemsByFornecedor(items) {
  const map = new Map()
  for (const item of items ?? []) {
    const nome = item.product?.fornecedor_nome?.trim() || 'Sem fornecedor'
    if (!map.has(nome)) map.set(nome, [])
    map.get(nome).push(item)
  }
  return [...map.entries()].map(([fornecedor, groupItems]) => ({
    fornecedor,
    items: groupItems,
  }))
}

function Th({ children, align = 'left', w }) {
  return (
    <th
      style={{
        padding: '10px 10px',
        textAlign: align,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        width: w,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}

function Td({ children, align = 'left', mono, strong, muted }) {
  return (
    <td
      style={{
        padding: '9px 10px',
        textAlign: align,
        borderTop: '1px solid #e2e8f0',
        fontWeight: strong ? 600 : 400,
        color: muted ? '#64748b' : '#0f172a',
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        verticalAlign: 'top',
        fontFamily: mono
          ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
          : undefined,
        fontSize: mono ? 10.5 : undefined,
      }}
    >
      {children}
    </td>
  )
}
