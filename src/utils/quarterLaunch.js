const LAUNCH_ESTADOS = ['MG', 'SP', 'RS']

function quarterLabel(entry) {
  return String(entry?.quarter ?? '').trim() || 'sem quarter'
}

/**
 * Motivo para não gravar este lote. Lote já concluído não é bloqueio:
 * a repetição apenas o ignora.
 */
export function quarterLaunchBlockReason(entry) {
  if (!entry || entry.status === 'concluido') return null
  if (entry.ativo === false) return 'Lista inativa.'
  if (!String(entry.moeda ?? '').trim()) return 'Moeda não definida.'
  if (!String(entry.quarter ?? '').trim()) return 'Quarter não definido.'

  const estado = String(entry.estadoPadrao ?? '').trim()
  if (!LAUNCH_ESTADOS.includes(estado)) {
    return 'Estado padrão (MG/SP/RS) obrigatório.'
  }

  const produtos = Array.isArray(entry.produtos) ? entry.produtos : []
  if (produtos.length === 0) return 'Nenhum produto para lançar.'

  for (const produto of produtos) {
    if (produto?.statusLinha === 'erro') {
      return 'Existem linhas com erro.'
    }
    if (Array.isArray(produto?.erros) && produto.erros.length > 0) {
      return produto.erros[0]
    }
    if (!String(produto?.nome ?? '').trim()) return 'Fertilizante inválido.'
    const preco = Number(produto?.preco)
    if (!Number.isFinite(preco) || preco < 0) return 'Preço inválido.'
    const desconto = Number(produto?.desconto ?? 0)
    if (Number.isFinite(desconto) && preco - desconto < 0) {
      return 'Desconto maior que o preço.'
    }
    const quarter = String(produto?.quarter || entry.quarter || '').trim()
    if (!quarter) return 'Quarter obrigatório para o produto.'
  }

  if (entry.status && entry.status !== 'aguardando_validacao') {
    return 'Lote não está aguardando validação.'
  }

  return null
}

export function planQuarterLaunch(entries) {
  const list = Array.isArray(entries) ? entries : []
  const alreadyLaunched = list.filter((entry) => entry?.status === 'concluido')
  const pending = list.filter((entry) => entry?.status !== 'concluido')
  const blocked = pending.flatMap((entry) => {
    const reason = entry?.blockedReason || quarterLaunchBlockReason(entry)
    return reason ? [{ ...entry, blockedReason: reason }] : []
  })

  if (blocked.length > 0) {
    const detail = blocked
      .map((entry) => `${quarterLabel(entry)}: ${entry.blockedReason}`)
      .join(' ')
    return {
      ok: false,
      error: detail,
      toLaunch: [],
      alreadyLaunched,
      blocked,
    }
  }

  const toLaunch = [...pending].sort((a, b) => {
    const byQuarter = quarterLabel(a).localeCompare(quarterLabel(b))
    if (byQuarter !== 0) return byQuarter
    return String(a.loteId).localeCompare(String(b.loteId))
  })

  return {
    ok: true,
    error: null,
    toLaunch,
    alreadyLaunched,
    blocked: [],
  }
}

/**
 * Grava cada quarter pendente. Quarter concluído não é enviado de novo.
 * Se um grupo falha, os seguintes não são gravados.
 */
export async function runQuarterLaunch(entries, promote) {
  const plan = planQuarterLaunch(entries)
  if (!plan.ok) {
    return {
      ok: false,
      phase: 'preflight',
      error: plan.error,
      launched: [],
      failed: plan.blocked[0] ?? null,
      pending: [],
      alreadyLaunched: plan.alreadyLaunched,
      repeated: false,
    }
  }

  if (plan.toLaunch.length === 0) {
    return {
      ok: true,
      phase: 'done',
      error: null,
      launched: [],
      failed: null,
      pending: [],
      alreadyLaunched: plan.alreadyLaunched,
      repeated: plan.alreadyLaunched.length > 0,
    }
  }

  const launched = []
  for (let index = 0; index < plan.toLaunch.length; index += 1) {
    const entry = plan.toLaunch[index]
    let res
    try {
      res = await promote(entry)
    } catch (error) {
      res = { ok: false, error: error?.message || 'Falha ao gravar o quarter.' }
    }

    if (!res?.ok) {
      return {
        ok: false,
        phase: 'write',
        error: res?.error || 'Falha ao gravar o quarter.',
        launched,
        failed: entry,
        pending: plan.toLaunch.slice(index + 1),
        alreadyLaunched: plan.alreadyLaunched,
        repeated: false,
      }
    }

    launched.push({ ...entry, result: res.result ?? null })
  }

  return {
    ok: true,
    phase: 'done',
    error: null,
    launched,
    failed: null,
    pending: [],
    alreadyLaunched: plan.alreadyLaunched,
    repeated: false,
  }
}

export function collectQuarterLaunchIds(currentId, groupLotes = []) {
  const ids = []
  const push = (value) => {
    const id = String(value ?? '').trim()
    if (!id || ids.includes(id)) return
    ids.push(id)
  }
  push(currentId)
  for (const item of groupLotes ?? []) {
    push(item?.loteId ?? item?.id)
  }
  return ids
}

export function formatQuarterLaunchSuccess(result) {
  const launched = result?.launched ?? []
  if (launched.length === 0 && result?.repeated) {
    return 'Estes quarters já estavam lançados. Nada foi gravado de novo.'
  }

  const novos = launched.reduce(
    (sum, item) => sum + Number(item.result?.novos ?? 0),
    0,
  )
  const atualizacoes = launched.reduce(
    (sum, item) => sum + Number(item.result?.atualizacoes ?? 0),
    0,
  )
  const listasInativadas = launched.reduce(
    (sum, item) => sum + Number(item.result?.listas_inativadas ?? 0),
    0,
  )
  const inativaMsg =
    listasInativadas > 0
      ? ` ${listasInativadas} lista(s) anterior(es) inativada(s).`
      : ''

  if (
    launched.length <= 1 &&
    (result?.alreadyLaunched ?? []).length === 0 &&
    (result?.pending ?? []).length === 0 &&
    !result?.failed
  ) {
    return `Lista lançada com sucesso: ${novos} novo(s), ${atualizacoes} atualização(ões).${inativaMsg}`
  }

  const labels = launched
    .map((item) => item.quarter)
    .filter(Boolean)
    .join(', ')
  const previous = (result?.alreadyLaunched ?? [])
    .map((item) => item.quarter)
    .filter(Boolean)
  const previousMsg = previous.length
    ? ` ${previous.join(', ')} já estava lançado.`
    : ''

  return `Listas lançadas (${labels}): ${novos} novo(s), ${atualizacoes} atualização(ões).${inativaMsg}${previousMsg}`
}

export function formatQuarterLaunchFailure(result) {
  if (result?.phase === 'preflight') {
    return `Nenhum quarter foi lançado. ${result.error}`
  }

  const failed = quarterLabel(result?.failed)
  const done = (result?.launched ?? [])
    .map((item) => item.quarter)
    .filter(Boolean)
  const pending = (result?.pending ?? [])
    .map((item) => item.quarter)
    .filter(Boolean)
  const parts = [`O quarter ${failed} não foi gravado: ${result?.error}`]
  if (done.length > 0) parts.push(`Já lançados: ${done.join(', ')}.`)
  if (pending.length > 0) parts.push(`Ainda pendentes: ${pending.join(', ')}.`)
  parts.push(
    'Lançar de novo continua só o que falta e não repete quarter já concluído.',
  )
  return parts.join(' ')
}

/**
 * Cria os grupos em sequência. Se um falha, desfaz os que esta tentativa criou.
 */
export async function recordQuarterGroups(groups, { createGroup, removeGroup }) {
  const created = []
  for (const group of groups ?? []) {
    const res = await createGroup(group)
    if (!res?.ok) {
      const removed = []
      const stuck = []
      for (const item of created) {
        const del = await removeGroup(item)
        if (del?.ok) removed.push(item)
        else stuck.push(item)
      }
      return {
        ok: false,
        error: res?.error || 'Falha ao gravar o grupo.',
        failed: { ...group, ...res },
        removed,
        stuck,
      }
    }
    created.push({ ...group, ...res })
  }

  return { ok: true, created, removed: [], stuck: [] }
}
