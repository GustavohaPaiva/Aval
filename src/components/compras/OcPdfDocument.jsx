import { SYAGRI_COMPANY } from '../../constants/company'
import { filialById } from '../../constants/compras'
import { formatQtyByUnit, formatUsd } from '../../utils/comprasUnits'

function formatDateBr(isoOrDate) {
  if (!isoOrDate) return '—'
  const raw = String(isoOrDate)
  const dayOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = dayOnly
    ? new Date(`${dayOnly[1]}-${dayOnly[2]}-${dayOnly[3]}T12:00:00`)
    : new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

function freightLabel(tipo) {
  if (tipo === 'CIF') return 'CIF'
  if (tipo === 'FOB') return 'FOB'
  return '—'
}

function liquidoUsd(item) {
  const preco = Number(item.preco_usd)
  const desc = Number(item.desconto_usd) || 0
  if (!Number.isFinite(preco)) return null
  return preco - desc
}

/**
 * PDF comercial da OC (colunas B). Visual alinhado ao pedido do cliente.
 */
export function OcPdfDocument({ compra, itens, fornecedorNome }) {
  const site = filialById(compra.filial_site)
  const otherSites = SYAGRI_COMPANY.sites.filter((s) => s.id !== site?.id)

  return (
    <div
      className="pedido-pdf-root box-border bg-white text-slate-900"
      style={{
        width: '794px',
        fontFamily:
          '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      <div className="pedido-pdf-page box-border bg-white">
        <div
          style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 45%, #064e3b 100%)',
            padding: '28px 32px 24px',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
            <div>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
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
                Pedido de fertilizantes
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#a7f3d0',
                  lineHeight: 1,
                }}
              >
                {compra.numero}
              </p>
            </div>
          </div>
        </div>

        <div style={{ padding: '22px 32px 28px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                borderRadius: 12,
                border: '1px solid #d1fae5',
                background: '#ecfdf5',
                padding: '12px 14px',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#047857',
                }}
              >
                Compradora · {site?.label ?? 'Filial'}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                {SYAGRI_COMPANY.legalName}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#334155' }}>
                CNPJ {site?.cnpj} · {site?.address} · {site?.city} · CEP {site?.cep}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#334155' }}>{site?.phone}</p>
            </div>
            <div
              style={{
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                padding: '12px 14px',
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
                Fornecedora
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                {fornecedorNome || '—'}
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 18,
            }}
          >
            {[
              { label: 'Data', value: formatDateBr(compra.data_documento) },
              { label: 'Condição', value: compra.condicao_pagamento || '—' },
              { label: 'Planta', value: compra.planta || '—' },
              { label: 'Tipo de entrega', value: freightLabel(compra.tipo_entrega) },
              { label: 'Cidade / retirada', value: compra.cidade_retirada || '—' },
              { label: 'Itens', value: String(itens?.length ?? 0) },
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
                <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>
                  {field.value}
                </p>
              </div>
            ))}
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 11,
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
            }}
          >
            <thead>
              <tr style={{ background: '#064e3b', color: '#fff' }}>
                <Th w={28}>#</Th>
                <Th>Produto</Th>
                <Th w={72}>Embalagem</Th>
                <Th align="right" w={70}>
                  Volume
                </Th>
                <Th align="right" w={72}>
                  USD
                </Th>
                <Th align="right" w={64}>
                  Desc.
                </Th>
                <Th align="right" w={72}>
                  Líquido
                </Th>
                <Th w={78}>Venc. lista</Th>
                <Th w={78}>Pagamento</Th>
              </tr>
            </thead>
            <tbody>
              {(itens ?? []).map((item, index) => {
                const liquido = liquidoUsd(item)
                return (
                  <tr
                    key={item.id}
                    style={{ background: index % 2 === 1 ? '#f8fafc' : '#ffffff' }}
                  >
                    <Td align="center" muted>
                      {index + 1}
                    </Td>
                    <Td strong>
                      {item.product?.displayNome || '—'}
                      {item.cultura ? (
                        <span style={{ display: 'block', fontWeight: 400, color: '#64748b', fontSize: 10 }}>
                          Cultura: {item.cultura}
                          {item.origem ? ` · Origem: ${item.origem}` : ''}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{item.embalagem || '—'}</Td>
                    <Td align="right" mono>
                      {formatQtyByUnit(item.volume_kg, item.unidade_exibicao || 't')}
                    </Td>
                    <Td align="right" mono>
                      {formatUsd(item.preco_usd)}
                    </Td>
                    <Td align="right" mono>
                      {formatUsd(item.desconto_usd)}
                    </Td>
                    <Td align="right" mono strong>
                      {liquido == null ? '—' : formatUsd(liquido)}
                    </Td>
                    <Td>{formatDateBr(item.vencimento_lista)}</Td>
                    <Td>{formatDateBr(item.pagamento_syagri)}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {compra.observacoes ? (
            <section
              style={{
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                padding: '12px 14px',
                marginTop: 16,
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
              <p style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', color: '#0f172a' }}>
                {compra.observacoes}
              </p>
            </section>
          ) : null}

          {otherSites.length > 0 ? (
            <p style={{ margin: '16px 0 0', fontSize: 8, color: '#94a3b8', lineHeight: 1.4 }}>
              Demais unidades: {otherSites.map((s) => `${s.label} (${s.cnpj})`).join(' · ')}
            </p>
          ) : null}

          <p
            style={{
              margin: '14px 0 0',
              textAlign: 'center',
              fontSize: 9,
              color: '#94a3b8',
            }}
          >
            Documento gerado pela {SYAGRI_COMPANY.brandName} · {compra.numero} ·{' '}
            {formatDateBr(new Date().toISOString())}
          </p>
        </div>
      </div>
    </div>
  )
}

function Th({ children, align = 'left', w }) {
  return (
    <th
      style={{
        padding: '9px 8px',
        textAlign: align,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.05em',
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
        padding: '8px',
        textAlign: align,
        borderTop: '1px solid #e2e8f0',
        fontWeight: strong ? 600 : 400,
        color: muted ? '#64748b' : '#0f172a',
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        verticalAlign: 'top',
        fontFamily: mono
          ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
          : undefined,
        fontSize: mono ? 10 : undefined,
      }}
    >
      {children}
    </td>
  )
}
