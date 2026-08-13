import { supabase } from './supabase'
import {
  digitsOnly,
  parseCpfCnpjInput,
  parsePhoneInput,
} from '../utils/dataFormatters'
import { isHiddenDraft } from '../utils/simulationLifecycle'

const CLIENT_FIELDS =
  'id, nome, razao_social, cnpj_cpf, email, telefone, municipio, uf, ativo, created_at'

const CLIENT_DETAIL_FIELDS =
  'id, nome, razao_social, cnpj_cpf, email, telefone, municipio, uf, ativo, created_at'

const DUPLICATE_CNPJ_CPF_ERROR =
  'Esse CPF ou CNPJ não pode ser lançado.'

const LINKED_SIMULATIONS_DELETE_ERROR =
  'Não é possível excluir: este cliente possui simulações ou pedidos vinculados. Inative o cliente em vez de excluir.'

function parseClientDbError(error) {
  if (!error) return 'Não foi possível concluir a operação.'
  if (error.code === '23505') return DUPLICATE_CNPJ_CPF_ERROR
  if (
    error.code === '23503' ||
    /foreign key|violates foreign key/i.test(error.message ?? '')
  ) {
    return LINKED_SIMULATIONS_DELETE_ERROR
  }
  return error.message || 'Não foi possível concluir a operação.'
}

export async function fetchClientById(id) {
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_DETAIL_FIELDS)
    .eq('id', id)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Cliente não encontrado.' }
  return { ok: true, client: data }
}

export async function fetchClientSimulations(clientId) {
  const { data, error } = await supabase
    .from('simulations')
    .select('id, created_at, updated_at, total_proposta, total_bruto, status, ativo')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) return { ok: false, error: error.message }
  const rows = (data ?? []).filter((row) => !isHiddenDraft(row))
  return { ok: true, rows }
}


export async function fetchClientsTotalCount() {
  const { count, error } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, total: count ?? 0 }
}

export async function fetchClientsList(params = {}) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 50))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('clients')
    .select(CLIENT_FIELDS, { count: 'exact' })
    .order('nome', { ascending: true })
    .range(from, to)

  const search = (params.search ?? '').trim()
  if (search) {
    const searchDigits = digitsOnly(search)
    const filters = [`nome.ilike.%${search}%`, `cnpj_cpf.ilike.%${search}%`]
    if (searchDigits.length >= 3 && searchDigits !== search) {
      filters.push(`cnpj_cpf.ilike.%${searchDigits}%`)
    }
    q = q.or(filters.join(','))
  }

  const { data, error, count } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true, rows: data ?? [], total: count ?? 0 }
}

export async function createClient(payload) {
  const nome = payload.nome?.trim()
  const cnpj_cpf = parseCpfCnpjInput(payload.cnpj_cpf ?? '') || null

  if (!nome) {
    return { ok: false, error: 'Informe o nome do cliente.' }
  }

  const telefoneRaw = payload.telefone ? parsePhoneInput(payload.telefone) : ''

  const { data, error } = await supabase
    .from('clients')
    .insert({
      nome,
      cnpj_cpf,
      razao_social: payload.razao_social?.trim() || null,
      email: payload.email?.trim() || null,
      telefone: telefoneRaw || null,
      municipio: payload.municipio?.trim() || null,
      uf: payload.uf?.trim() || null,
      ativo: true,
    })
    .select(CLIENT_FIELDS)
    .single()

  if (error) return { ok: false, error: parseClientDbError(error) }
  return { ok: true, client: data }
}

export async function updateClient(id, payload) {
  const nome = payload.nome?.trim()
  const cnpj_cpf = parseCpfCnpjInput(payload.cnpj_cpf ?? '') || null

  if (!nome) {
    return { ok: false, error: 'Informe o nome do cliente.' }
  }

  const telefoneRaw = payload.telefone ? parsePhoneInput(payload.telefone) : ''

  const { data, error } = await supabase
    .from('clients')
    .update({
      nome,
      cnpj_cpf,
      razao_social: payload.razao_social?.trim() || null,
      email: payload.email?.trim() || null,
      telefone: telefoneRaw || null,
      municipio: payload.municipio?.trim() || null,
      uf: payload.uf?.trim() || null,
    })
    .eq('id', id)
    .select(CLIENT_FIELDS)
    .single()

  if (error) return { ok: false, error: parseClientDbError(error) }
  return { ok: true, client: data }
}

export async function setClientAtivo(id, ativo) {
  const { data, error } = await supabase
    .from('clients')
    .update({ ativo: Boolean(ativo) })
    .eq('id', id)
    .select(CLIENT_DETAIL_FIELDS)
    .single()

  if (error) return { ok: false, error: parseClientDbError(error) }
  return { ok: true, client: data }
}

export async function deleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id)

  if (error) return { ok: false, error: parseClientDbError(error) }
  return { ok: true }
}
