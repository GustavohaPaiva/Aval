import { isPropostaBelowFloor } from './autonomiaDesconto'
import { roundMoney } from './roundMoney'

export function clampProposta(proposta) {
  const p = Number.isFinite(proposta) ? proposta : 0
  return Math.max(0, p)
}

export function normalizeDescontoPct(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

/** Comparação de % com 2 casas (mesmo passo do input). */
export function roundDescontoPct(value) {
  return Math.round(normalizeDescontoPct(value) * 100) / 100
}

/** Desconto % em relação ao valor unitário (tabela). */
export function calcDescontoPct(precoUnitario, proposta) {
  const pu = Number(precoUnitario)
  if (!(pu > 0)) return 0
  const prop = clampProposta(proposta)
  return normalizeDescontoPct(((pu - prop) / pu) * 100)
}

export function calcPropostaFromDesconto(precoUnitario, descontoPct) {
  const pu = Number(precoUnitario) || 0
  const pct = normalizeDescontoPct(descontoPct)
  return clampProposta(roundMoney(pu * (1 - pct / 100)))
}

/**
 * Proposta travada a partir da solicitação de revisão.
 * Rascunho inédito continua acompanhando a tabela; depois disso o valor
 * só muda por edição manual na simulação.
 */
export function isPropostaTravada(simulation) {
  if (!simulation) return false
  if (simulation.proposta_travada_em) return true
  const status = simulation.status
  return Boolean(status) && status !== 'draft'
}

export function resolvePropostaTravadaEm(status, current) {
  if (current?.proposta_travada_em) return String(current.proposta_travada_em)
  if (status && status !== 'draft') return new Date().toISOString()
  if (current?.status && current.status !== 'draft') {
    return new Date().toISOString()
  }
  return null
}

/**
 * Recalcula proposta/% quando o preço de tabela muda (dólar, frete, prazo).
 * Com lock: mantém a proposta e só atualiza o %.
 * Sem lock: a proposta acompanha o desconto sobre o novo preço.
 */
export function syncLineOnTableChange(line, options) {
  if (!line?.productId || line.snapshot) return line
  const {
    precoUnitario,
    floorUnit,
    canOverrideFloor = false,
    lockProposta = false,
  } = options
  const pu = Number(precoUnitario) || 0
  const hasDesconto =
    line.descontoPct != null && Number.isFinite(Number(line.descontoPct))

  if (lockProposta) {
    const proposta = clampProposta(line.proposta)
    const nextDesconto =
      !canOverrideFloor && isPropostaBelowFloor(proposta, floorUnit)
        ? null
        : calcDescontoPct(pu, proposta)
    if (
      roundMoney(line.proposta) === roundMoney(proposta) &&
      line.descontoPct === nextDesconto
    ) {
      return line
    }
    return { ...line, proposta, descontoPct: nextDesconto }
  }

  if (!hasDesconto) {
    const proposta = clampProposta(line.proposta)
    if (!canOverrideFloor && isPropostaBelowFloor(proposta, floorUnit)) {
      return line
    }
    return { ...line, descontoPct: calcDescontoPct(pu, proposta) }
  }

  const descontoPct = normalizeDescontoPct(line.descontoPct)
  const proposta = calcPropostaFromDesconto(pu, descontoPct)
  const nextDesconto =
    !canOverrideFloor && isPropostaBelowFloor(proposta, floorUnit)
      ? null
      : descontoPct
  if (
    roundMoney(line.proposta) === proposta &&
    line.descontoPct === nextDesconto
  ) {
    return line
  }
  return { ...line, descontoPct: nextDesconto, proposta }
}
