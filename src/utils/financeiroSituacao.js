/** Dias corridos, inclusive hoje, em que o vencimento conta como próximo. */
export const DIAS_PROXIMO_VENCIMENTO = 7

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

export function toCents(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function fromCents(cents) {
  return cents / 100
}

export function dateKey(value) {
  if (value == null || value === '') return null
  const raw = String(value).trim().slice(0, 10)
  return DATE_KEY.test(raw) ? raw : null
}

function addDays(iso, days) {
  const match = DATE_KEY.exec(iso)
  if (!match) return null
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/**
 * Separa o progresso do pagamento da situação do vencimento.
 * Quitado exige recebimento integral do valor devido, em centavos.
 * Comissão só libera com quitação e valor devido maior que zero.
 */
export function classificarFinanceiro({
  valorDevido,
  valorRecebido = 0,
  vencimento,
  hoje,
  diasProximo = DIAS_PROXIMO_VENCIMENTO,
} = {}) {
  const devidoCents = toCents(valorDevido ?? 0)
  const recebidoCents = toCents(valorRecebido ?? 0)
  const hojeKey = dateKey(hoje)
  if (devidoCents == null || recebidoCents == null || !hojeKey) {
    return null
  }

  const recebido = Math.max(0, recebidoCents)
  const saldo = devidoCents - recebido
  const quitado = saldo <= 0
  const pagamento = quitado ? 'quitado' : recebido > 0 ? 'parcial' : 'pendente'

  let situacaoVencimento
  const vencimentoKey = dateKey(vencimento)
  if (quitado) {
    situacaoVencimento = 'quitado'
  } else if (!vencimentoKey) {
    situacaoVencimento = 'sem_data'
  } else if (vencimentoKey < hojeKey) {
    situacaoVencimento = 'atrasado'
  } else if (vencimentoKey <= addDays(hojeKey, diasProximo)) {
    situacaoVencimento = 'proximo'
  } else {
    situacaoVencimento = 'no_prazo'
  }

  return {
    valorDevido: fromCents(devidoCents),
    valorRecebido: fromCents(recebido),
    saldo: fromCents(Math.max(saldo, 0)),
    pagamento,
    situacaoVencimento,
    quitado,
    comissaoLiberada: quitado && devidoCents > 0,
  }
}

export function calcularSaldo({ valorDevido, recebimentos = [] } = {}) {
  const recebido = (recebimentos ?? [])
    .filter((row) => row?.status === 'ativo')
    .reduce((acc, row) => acc + (toCents(row.valor) ?? 0), 0)
  return classificarFinanceiro({
    valorDevido,
    valorRecebido: fromCents(recebido),
    vencimento: null,
    hoje: '2000-01-01',
  })
}

export function validarNovoRecebimento({
  valorDevido,
  recebimentos = [],
  valor,
  idempotencyKey,
} = {}) {
  const saldo = calcularSaldo({ valorDevido, recebimentos })
  if (!saldo) return { ok: false, error: 'Valor devido inválido.' }

  const cents = toCents(valor)
  if (cents == null || cents <= 0) {
    return { ok: false, error: 'Informe um valor maior que zero.' }
  }

  const key = String(idempotencyKey ?? '').trim()
  if (!key) return { ok: false, error: 'Operação sem identificação.' }

  const duplicado = (recebimentos ?? []).find(
    (row) => String(row.idempotencyKey ?? '') === key,
  )
  if (duplicado) {
    return { ok: false, error: 'Este recebimento já foi registrado.', duplicado: true }
  }

  const saldoCents = toCents(saldo.saldo)
  if (cents > saldoCents) {
    return { ok: false, error: 'Recebimento acima do saldo em aberto.' }
  }

  return { ok: true, valor: fromCents(cents) }
}

export function validarRenegociacao({ vencimentoAtual, vencimentoNovo } = {}) {
  const novo = dateKey(vencimentoNovo)
  if (!novo) return { ok: false, error: 'Informe o novo vencimento.' }
  const atual = dateKey(vencimentoAtual)
  if (atual && atual === novo) {
    return { ok: false, error: 'O vencimento informado já é o vigente.' }
  }
  return { ok: true, vencimentoAnterior: atual, vencimentoNovo: novo }
}

export function comissaoLiberadaPorQuitacao(situacao) {
  if (!situacao) return false
  const devido = toCents(situacao.valorDevido ?? situacao.valor_devido)
  return Boolean(situacao.quitado ?? situacao.pagamento === 'quitado') && devido != null && devido > 0
}

/** Janela da situação única exibida na tela. O classificador do banco continua em 7 dias. */
export const DIAS_STATUS_PRINCIPAL = 3

export function hojeSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Uma situação por pedido. Atraso e proximidade prevalecem sobre parcial e pendente.
 * Próximo inclui hoje e os 3 dias seguintes.
 */
export function statusPrincipalFinanceiro({
  pagamento,
  valorRecebido = 0,
  saldo,
  quitado,
  vencimento,
  hoje,
  diasProximo = DIAS_STATUS_PRINCIPAL,
} = {}) {
  const hojeKey = dateKey(hoje) ?? hojeSaoPaulo()
  const saldoCents = saldo == null ? null : toCents(saldo)
  const recebidoCents = toCents(valorRecebido ?? 0)
  const integral =
    saldoCents != null
      ? saldoCents <= 0
      : Boolean(quitado) || pagamento === 'quitado'

  if (integral) return 'quitado'

  const vencimentoKey = dateKey(vencimento)
  if (!vencimentoKey) return 'sem_vencimento'
  if (vencimentoKey < hojeKey) return 'atrasado'
  if (vencimentoKey <= addDays(hojeKey, diasProximo)) return 'proximo'

  const parcial = pagamento === 'parcial' || (recebidoCents != null && recebidoCents > 0)
  return parcial ? 'parcial' : 'pendente'
}

export const STATUS_PRINCIPAL_LABEL = {
  quitado: 'Quitado',
  atrasado: 'Atrasado',
  proximo: 'Próximo do vencimento',
  parcial: 'Parcial',
  pendente: 'Pendente',
  sem_vencimento: 'Sem vencimento',
}

export const PAGAMENTO_LABEL = {
  pendente: 'Pendente',
  parcial: 'Parcialmente pago',
  quitado: 'Quitado',
}

export const VENCIMENTO_LABEL = {
  sem_data: 'Sem vencimento',
  no_prazo: 'No prazo',
  proximo: 'Próximo do vencimento',
  atrasado: 'Atrasado',
  quitado: 'Quitado',
}
