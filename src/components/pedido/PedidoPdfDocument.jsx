import { SYAGRI_COMPANY } from '../../constants/company'
import { formatProdutoDisplayNome } from '../../constants/mapeamentoCampos'
import { displayCpfCnpj, displayPhone } from '../../utils/dataFormatters'
import { formatBRL } from '../../utils/money'
import { roundMoney } from '../../utils/roundMoney'

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

function buildPedidoLocal(simulation) {
  const parts = [
    simulation.fazenda?.trim() || null,
    simulation.pedido_municipio && simulation.pedido_uf
      ? `${simulation.pedido_municipio} / ${simulation.pedido_uf}`
      : simulation.pedido_municipio || simulation.pedido_uf || null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Documento visual da proposta comercial (PDF).
 * Largura fixa A4 (~794px @96dpi) para captura estável via html2canvas.
 */
export function PedidoPdfDocument({
  bundle,
  vendedorNome,
}) {
  const { simulation, client, items } = bundle
  const docNo = formatDocNumber(simulation.id)
  const pedidoLocal = buildPedidoLocal(simulation)
  const municipioUf =
    [simulation.pedido_municipio, simulation.pedido_uf].filter(Boolean).join(' / ') ||
    [client.municipio, client.uf].filter(Boolean).join(' / ') ||
    '—'
  const prazoLabel = simulation.prazo_dias
    ? `${simulation.prazo_dias} dias`
    : '14 dias'

  return (
    <div
      className="pedido-pdf-root box-border bg-white text-slate-900"
      style={{
        width: '794px',
        fontFamily:
          '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      {/* Faixa superior marca */}
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
              Proposta comercial
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
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 5,
          }}
        >
          {SYAGRI_COMPANY.sites.map((site) => (
            <div
              key={`${site.label}-${site.city}`}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                padding: '6px 5px',
                minWidth: 0,
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  opacity: 0.75,
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {site.label}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 6.5,
                  opacity: 0.9,
                  whiteSpace: 'nowrap',
                }}
              >
                {site.cnpj}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 6.5,
                  lineHeight: 1.25,
                  opacity: 0.9,
                  wordBreak: 'break-word',
                }}
              >
                {site.address}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 6.5,
                  opacity: 0.85,
                  whiteSpace: 'nowrap',
                }}
              >
                CEP {site.cep}
              </p>
              <p style={{ margin: '1px 0 0', fontSize: 6.5, opacity: 0.85 }}>
                {site.phone}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '22px 32px 28px' }}>
        {/* Meta */}
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
            { label: 'Vendedor', value: vendedorNome || '—' },
            { label: 'Validade / Pagamento', value: formatDateBr(simulation.data_pagamento) },
            { label: 'Prazo', value: prazoLabel },
            { label: 'Frete', value: freightLabel(simulation.tipo_frete) },
            { label: 'Fazenda', value: simulation.fazenda?.trim() || '—' },
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
          O Comprador e o Vendedor firmam a presente proposta comercial nos termos
          abaixo, com preços e condições indicados para a operação simulada.
        </p>

        {/* Cliente */}
        <section
          style={{
            borderRadius: 14,
            border: '1px solid #d1fae5',
            background: 'linear-gradient(180deg, #ecfdf5 0%, #ffffff 55%)',
            padding: '14px 16px',
            marginBottom: 18,
          }}
        >
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#047857',
            }}
          >
            Dados do cliente
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 1fr',
              gap: '10px 14px',
            }}
          >
            <MetaField label="Nome / Razão social" value={client.nome || client.razao_social || '—'} />
            <MetaField label="Município / UF" value={municipioUf} />
            <MetaField label="CPF / CNPJ" value={displayCpfCnpj(client.cnpj_cpf) || '—'} />
            <MetaField
              label="Endereço"
              value={client.endereco || '—'}
            />
            <MetaField label="Telefone" value={displayPhone(client.telefone) || '—'} />
            <MetaField label="E-mail" value={client.email || '—'} />
          </div>
        </section>

        {/* Itens */}
        <section style={{ marginBottom: 16 }}>
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
              Descrição dos produtos
            </p>
            {simulation.quarter ? (
              <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                Lista / Quarter: <strong style={{ color: '#0f172a' }}>{simulation.quarter}</strong>
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
                <Th align="right" w={70}>
                  Qtd.
                </Th>
                <Th>Descrição</Th>
                <Th w={110}>Cultura</Th>
                <Th align="right" w={100}>
                  Preço unit.
                </Th>
                <Th align="right" w={110}>
                  Valor total
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const total = roundMoney(item.volume * item.proposta)
                const zebra = index % 2 === 1
                return (
                  <tr
                    key={item.id}
                    style={{ background: zebra ? '#f8fafc' : '#ffffff' }}
                  >
                    <Td align="center" muted>
                      {index + 1}
                    </Td>
                    <Td align="right" mono>
                      {item.volume}
                    </Td>
                    <Td strong>
                      {item.product
                        ? formatProdutoDisplayNome({
                            nome: item.product.nome,
                            referencia_complementar:
                              item.product.referencia_complementar,
                            fornecedor_nome: item.product.fornecedor_nome,
                          }) || '—'
                        : '—'}
                    </Td>
                    <Td>{item.cultura || '—'}</Td>
                    <Td align="right" mono>
                      {formatBRL(item.proposta)}
                    </Td>
                    <Td align="right" mono strong>
                      {formatBRL(total)}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {/* Total + entrega */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              padding: '12px 14px',
              background: '#fff',
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
              Endereço para entrega
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: '#0f172a' }}>
              {pedidoLocal ||
                (simulation.destino_frete
                  ? `Destino: ${simulation.destino_frete}`
                  : 'A definir com o cliente.')}
            </p>
            {simulation.destino_frete && pedidoLocal ? (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>
                Destino do frete: {simulation.destino_frete}
              </p>
            ) : null}
            {simulation.origem_frete ? (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>
                Origem do frete: {simulation.origem_frete}
              </p>
            ) : null}
          </div>

          <div
            style={{
              borderRadius: 14,
              background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
              padding: '14px 16px',
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                opacity: 0.8,
              }}
            >
              Total da proposta
            </p>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatBRL(simulation.total_proposta)}
            </p>
          </div>
        </div>

        {/* Observações */}
        <section
          style={{
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            padding: '12px 14px',
            marginBottom: 16,
            minHeight: 72,
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
            margin: '0 0 18px',
            fontSize: 10,
            lineHeight: 1.45,
            color: '#64748b',
          }}
        >
          {SYAGRI_COMPANY.terms}
        </p>

        {/* Assinaturas */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 20,
            marginTop: 8,
            paddingTop: 8,
          }}
        >
          <SignatureLine label="Assinatura do Comprador(a)" />
          <SignatureLine label="Testemunha 1" />
          <SignatureLine label="Testemunha 2" />
        </div>

        <p
          style={{
            margin: '22px 0 0',
            textAlign: 'center',
            fontSize: 9,
            color: '#94a3b8',
            letterSpacing: '0.02em',
          }}
        >
          Documento gerado pela SYAGRI · Proposta nº {docNo} ·{' '}
          {formatDateBr(new Date().toISOString())}
        </p>
      </div>
    </div>
  )
}

function MetaField({ label, value }) {
  return (
    <div>
      <p
        style={{
          margin: 0,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#64748b',
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: '2px 0 0',
          fontSize: 12.5,
          fontWeight: 600,
          color: '#0f172a',
          lineHeight: 1.35,
        }}
      >
        {value}
      </p>
    </div>
  )
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
      }}
    >
      {children}
    </td>
  )
}

function SignatureLine({ label }) {
  return (
    <div style={{ paddingTop: 36 }}>
      <div style={{ borderTop: '1px solid #94a3b8' }} />
      <p
        style={{
          margin: '8px 0 0',
          textAlign: 'center',
          fontSize: 10,
          color: '#64748b',
        }}
      >
        {label}
      </p>
    </div>
  )
}
