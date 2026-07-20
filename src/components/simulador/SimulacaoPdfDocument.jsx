import { IconLeaf } from '../icons'
import { SYAGRI_COMPANY } from '../../constants/company'
import { displayCpfCnpj } from '../../utils/dataFormatters'
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
  if (!id) return 'RASC'
  const digits = String(id).replace(/\D/g, '')
  if (digits.length >= 5) return digits.slice(-5).toUpperCase()
  return String(id).slice(0, 8).toUpperCase()
}

/**
 * Proposta comercial enxuta gerada a partir da simulação (sem custos/margem).
 * Largura fixa A4 (~794px @96dpi) para captura via html2canvas.
 */
export function SimulacaoPdfDocument({ snapshot, vendedorNome }) {
  const {
    id,
    clientName,
    clientCnpjCpf,
    dataPagamento,
    tipoFrete,
    origemFrete,
    destinoFrete,
    quarter,
    observacoes,
    totalProposta,
    lines,
  } = snapshot

  const docNo = formatDocNumber(id)
  const destino =
    destinoFrete?.trim() ||
    (tipoFrete === 'FOB' ? 'Retirada pelo cliente' : 'A definir com o cliente.')

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
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <IconLeaf className="size-7 text-white" />
            </div>
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
      </div>

      <div style={{ padding: '22px 32px 28px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: 18,
          }}
        >
          {[
            { label: 'Data', value: formatDateBr(new Date().toISOString()) },
            { label: 'Vendedor', value: vendedorNome || '—' },
            { label: 'Pagamento', value: formatDateBr(dataPagamento) },
            { label: 'Frete', value: freightLabel(tipoFrete) },
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
              gridTemplateColumns: '1.4fr 1fr',
              gap: '10px 14px',
            }}
          >
            <MetaField label="Nome / Razão social" value={clientName || '—'} />
            <MetaField
              label="CPF / CNPJ"
              value={displayCpfCnpj(clientCnpjCpf) || '—'}
            />
          </div>
        </section>

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
            {quarter ? (
              <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                Lista / Quarter:{' '}
                <strong style={{ color: '#0f172a' }}>{quarter}</strong>
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
              {lines.map((item, index) => {
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
                    <Td strong>{item.displayNome || '—'}</Td>
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
              Destino / entrega
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: '#0f172a' }}>
              {destino}
            </p>
            {origemFrete ? (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b' }}>
                Origem do frete: {origemFrete}
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
              {formatBRL(totalProposta)}
            </p>
          </div>
        </div>

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
              color: observacoes?.trim() ? '#0f172a' : '#94a3b8',
              whiteSpace: 'pre-wrap',
            }}
          >
            {observacoes?.trim() || 'Sem observações adicionais.'}
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
            marginTop: 8,
            paddingTop: 8,
          }}
        >
          <SignatureLine label="Assinatura do Comprador(a)" />
          <SignatureLine label="Assinatura SyAgri" />
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
          Documento gerado pelo sistema SyAgri · Proposta nº {docNo} ·{' '}
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
