import { roundMoney } from '../utils/roundMoney';
import { parseCpfCnpjInput } from '../utils/dataFormatters';
import { notifyConsultorSimulationDecision } from './notificationService';
import {
    syncComissaoRegistroFromSimulation,
    upsertComissaoRegistro,
} from './comissaoService';
import { supabase } from './supabase';

async function resolveClientId(input) {
    const nome = (input.clientName ?? '').trim();
    if (!nome) {
        return { ok: false, error: 'Informe o nome do cliente.' };
    }
    const cnpj = parseCpfCnpjInput(input.clientCnpjCpf ?? '') || null;
    let clientId = input.clientId ?? null;
    if (clientId) {
        const { data: existing, error: existingError } = await supabase
            .from('clients')
            .select('id, ativo')
            .eq('id', clientId)
            .maybeSingle();
        if (existingError) {
            return {
                ok: false,
                error: existingError.message ?? 'Não foi possível validar o cliente.',
            };
        }
        if (!existing) {
            return { ok: false, error: 'Cliente não encontrado.' };
        }
        if (existing.ativo === false) {
            return {
                ok: false,
                error: 'Este cliente está inativo e não pode receber lançamentos.',
            };
        }
        return { ok: true, clientId };
    }
    const { data: clientRow, error: clientError } = await supabase
        .from('clients')
        .insert({
            nome,
            cnpj_cpf: cnpj,
            uf: input.estado ?? null,
            ativo: true,
        })
        .select('id')
        .single();
    if (clientError || !clientRow) {
        if (clientError?.code === '23505') {
            return {
                ok: false,
                error: 'Esse CPF ou CNPJ não pode ser lançado.',
            };
        }
        return {
            ok: false,
            error: clientError?.message ?? 'Não foi possível salvar o cliente.',
        };
    }
    return { ok: true, clientId: clientRow.id };
}

function buildSimulationFields(input, status) {
    const fields = {
        total_bruto: roundMoney(input.totalValor),
        total_proposta: roundMoney(input.totalProposta),
        status,
        tipo_frete: input.tipoFrete ?? null,
        origem_frete: input.origemFrete?.trim() || null,
        destino_frete: input.destinoFrete?.trim() || null,
        data_pagamento: input.dataPagamento || null,
        quarter: input.quarter ?? null,
        observacoes: input.observacoes?.trim() || null,
    };
    if (input.comissaoValorTotal != null) {
        fields.comissao_valor_total = roundMoney(input.comissaoValorTotal);
    }
    return fields;
}

function buildOverrideFields(overrides, userId) {
    const ov = overrides ?? {};
    const hasOverride = [
        'custoUsd',
        'descontoUsd',
        'taxa',
        'frete',
        'taxaAntecipacao',
        'taxaJuros',
    ].some((f) => ov[f] != null);
    return {
        override_custo_usd: ov.custoUsd ?? null,
        override_desconto_usd: ov.descontoUsd ?? null,
        override_taxa: ov.taxa ?? null,
        override_frete: ov.frete ?? null,
        override_taxa_antecipacao: ov.taxaAntecipacao ?? null,
        override_taxa_juros: ov.taxaJuros ?? null,
        override_por: hasOverride ? userId ?? null : null,
        override_em: hasOverride ? new Date().toISOString() : null,
    };
}

async function deleteSimulationById(simulationId) {
    await supabase.from('simulations').delete().eq('id', simulationId);
}

function mapLinesToItemsPayload(simulationId, lines, statusLinha, userId) {
    return lines.map((line) => ({
        simulation_id: simulationId,
        product_id: line.productId,
        volume: line.volume,
        preco_unitario: roundMoney(line.precoUnitario),
        proposta: roundMoney(line.proposta),
        cultura: line.cultura ?? null,
        status_linha: statusLinha,
        produto_classe: line.produtoClasse ?? line.classe ?? null,
        margem_percentual:
            line.margemPercentual != null ? Number(line.margemPercentual) : null,
        comissao_percentual:
            line.comissaoPercentual != null
                ? Number(line.comissaoPercentual)
                : null,
        comissao_valor:
            line.comissaoValor != null ? roundMoney(line.comissaoValor) : null,
        ...buildOverrideFields(line.overrides, userId),
    }));
}

async function syncComissaoForSimulation(simulationId, consultorId, status, lines) {
    if (!simulationId || !consultorId) return { ok: true };
    if (status !== 'approved' && status !== 'converted') return { ok: true };

    const hasSnapshot = (lines ?? []).some(
        (line) =>
            line.comissaoPercentual != null || line.comissaoValor != null,
    );

    if (hasSnapshot) {
        return upsertComissaoRegistro({
            simulationId,
            consultorId,
            status: status === 'converted' ? 'confirmada' : 'calculada',
            itens: (lines ?? []).map((line) => ({
                productId: line.productId,
                classe: line.produtoClasse ?? line.classe,
                volume: line.volume,
                proposta: line.proposta,
                margemPercentual: line.margemPercentual,
                comissaoPercentual: line.comissaoPercentual,
                comissaoValor: line.comissaoValor,
                baseCalculo: line.comissaoBaseCalculo,
            })),
        });
    }

    return syncComissaoRegistroFromSimulation(simulationId, {
        status: status === 'converted' ? 'confirmada' : 'calculada',
    });
}

function parseItemsInsertError(itemsError) {
    const msg = itemsError?.message ?? '';
    if (
        itemsError?.code === '23503' ||
        /foreign key|violates foreign key/i.test(msg)
    ) {
        return 'Produto inválido no catálogo. Recarregue o quarter e tente novamente.';
    }
    if (
        itemsError?.code === '42501' ||
        /row-level security|violates row-level security/i.test(msg)
    ) {
        return 'Sem permissão para salvar os produtos desta simulação. Faça login novamente e tente outra vez.';
    }
    return msg || 'Não foi possível salvar os itens da simulação.';
}

async function insertSimulationItems(simulationId, lines, statusLinha, userId) {
    const invalid = lines.find(
        (line) => !line.productId || String(line.productId).startsWith('demo-'),
    );
    if (invalid) {
        return {
            ok: false,
            error: 'Selecione produtos do catálogo oficial (quarter e estado) antes de lançar.',
        };
    }
    const itemsPayload = mapLinesToItemsPayload(
        simulationId,
        lines,
        statusLinha,
        userId,
    );
    const { error: itemsError } = await supabase
        .from('simulation_items')
        .insert(itemsPayload);
    if (itemsError) {
        return { ok: false, error: parseItemsInsertError(itemsError) };
    }
    return { ok: true };
}

/**
 * Replace all items for a simulation without leaving it empty on insert failure:
 * snapshot → delete → insert; restore snapshot if insert fails.
 */
async function replaceSimulationItems(simulationId, lines, statusLinha, userId) {
    const invalid = lines.find(
        (line) => !line.productId || String(line.productId).startsWith('demo-'),
    );
    if (invalid) {
        return {
            ok: false,
            error: 'Selecione produtos do catálogo oficial (quarter e estado) antes de lançar.',
        };
    }

    const { data: previousItems, error: snapshotError } = await supabase
        .from('simulation_items')
        .select(
            'simulation_id, product_id, volume, preco_unitario, proposta, cultura, status_linha, produto_classe, margem_percentual, comissao_percentual, comissao_valor, override_custo_usd, override_desconto_usd, override_taxa, override_frete, override_taxa_antecipacao, override_taxa_juros, override_por, override_em',
        )
        .eq('simulation_id', simulationId);
    if (snapshotError) {
        return { ok: false, error: snapshotError.message };
    }

    const { error: deleteError } = await supabase
        .from('simulation_items')
        .delete()
        .eq('simulation_id', simulationId);
    if (deleteError) {
        return { ok: false, error: deleteError.message };
    }

    const itemsPayload = mapLinesToItemsPayload(
        simulationId,
        lines,
        statusLinha,
        userId,
    );
    const { error: itemsError } = await supabase
        .from('simulation_items')
        .insert(itemsPayload);
    if (!itemsError) {
        return { ok: true };
    }

    if (previousItems?.length) {
        await supabase.from('simulation_items').insert(previousItems);
    }
    return { ok: false, error: parseItemsInsertError(itemsError) };
}

function parseSimulationWriteError(error, fallback) {
    const msg = error?.message ?? '';
    if (
        error?.code === '42501' ||
        /row-level security|violates row-level security/i.test(msg)
    ) {
        return 'Sem permissão para salvar a simulação. Faça login novamente e tente outra vez.';
    }
    return msg || fallback;
}

async function requireAuthUser() {
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();
    if (error || !user) {
        return { ok: false, error: 'Sessão expirada. Faça login novamente.' };
    }
    return { ok: true, user };
}

/**
 * Upsert simulation + replace items. On item failure after a new insert, deletes the orphan simulation.
 */
async function upsertSimulationWithItems(input, status, userId) {
    const clientResult = await resolveClientId(input);
    if (!clientResult.ok) return clientResult;

    const simulationFields = {
        client_id: clientResult.clientId,
        ...buildSimulationFields(input, status),
    };

    let simulationId = input.simulationId ?? null;

    if (simulationId) {
        // Own rows only (consultor or gestor creating/editing their own drafts).
        // Gestor review of others' sims uses saveGestorReview instead.
        const { data: updatedRow, error: simError } = await supabase
            .from('simulations')
            .update(simulationFields)
            .eq('id', simulationId)
            .eq('user_id', userId)
            .select('id')
            .maybeSingle();
        if (simError) {
            return {
                ok: false,
                error: parseSimulationWriteError(
                    simError,
                    'Não foi possível atualizar a simulação.',
                ),
            };
        }
        if (!updatedRow) {
            return {
                ok: false,
                error: 'Simulação não encontrada ou sem permissão para alterar.',
            };
        }
        const itemsResult = await replaceSimulationItems(
            simulationId,
            input.lines,
            status,
            userId,
        );
        if (!itemsResult.ok) return itemsResult;
        const comissaoResult = await syncComissaoForSimulation(
            simulationId,
            userId,
            status,
            input.lines,
        );
        if (!comissaoResult.ok) return comissaoResult;
        return { ok: true, simulationId };
    }

    const { data: simRow, error: simError } = await supabase
        .from('simulations')
        .insert({
            user_id: userId,
            ...simulationFields,
        })
        .select('id')
        .single();
    if (simError || !simRow) {
        return {
            ok: false,
            error: parseSimulationWriteError(
                simError,
                'Não foi possível salvar a simulação.',
            ),
        };
    }
    simulationId = simRow.id;

    const itemsResult = await insertSimulationItems(
        simulationId,
        input.lines,
        status,
        userId,
    );
    if (!itemsResult.ok) {
        await deleteSimulationById(simulationId);
        return itemsResult;
    }
    const comissaoResult = await syncComissaoForSimulation(
        simulationId,
        userId,
        status,
        input.lines,
    );
    if (!comissaoResult.ok) {
        await deleteSimulationById(simulationId);
        return comissaoResult;
    }
    return { ok: true, simulationId };
}
function parseBundle(data) {
    if (!data || typeof data !== 'object')
        return null;
    const row = data;
    const rawClient = row.clients;
    const clientRow = Array.isArray(rawClient) ? rawClient[0] : rawClient;
    const rawItems = row.simulation_items;
    if (!clientRow || typeof clientRow !== 'object' || !Array.isArray(rawItems)) {
        return null;
    }
    const client = clientRow;
    const items = rawItems.map((it) => {
        const item = it;
        const rawProd = item.produtos_oficiais ?? item.products;
        const prodRow = Array.isArray(rawProd) ? rawProd[0] : rawProd;
        const prod = prodRow && typeof prodRow === 'object'
            ? prodRow
            : null;
        return {
            id: String(item.id),
            product_id: String(item.product_id ?? ''),
            volume: Number(item.volume),
            preco_unitario: Number(item.preco_unitario),
            proposta: Number(item.proposta),
            cultura: String(item.cultura ?? ''),
            override_custo_usd: item.override_custo_usd != null ? Number(item.override_custo_usd) : null,
            override_desconto_usd: item.override_desconto_usd != null ? Number(item.override_desconto_usd) : null,
            override_taxa: item.override_taxa != null ? Number(item.override_taxa) : null,
            override_frete: item.override_frete != null ? Number(item.override_frete) : null,
            override_taxa_antecipacao: item.override_taxa_antecipacao != null ? Number(item.override_taxa_antecipacao) : null,
            override_taxa_juros: item.override_taxa_juros != null ? Number(item.override_taxa_juros) : null,
            product: prod
                ? { nome: String(prod.nome ?? '') }
                : null,
        };
    });
    return {
        simulation: {
            id: String(row.id),
            user_id: String(row.user_id),
            client_id: String(row.client_id),
            total_bruto: Number(row.total_bruto),
            total_proposta: Number(row.total_proposta),
            status: row.status,
            tipo_frete: row.tipo_frete != null ? String(row.tipo_frete) : null,
            origem_frete: row.origem_frete != null ? String(row.origem_frete) : null,
            destino_frete: row.destino_frete != null ? String(row.destino_frete) : null,
            data_pagamento: row.data_pagamento != null ? String(row.data_pagamento) : null,
            quarter: row.quarter != null ? String(row.quarter) : null,
            observacoes: row.observacoes != null ? String(row.observacoes) : null,
            fazenda: row.fazenda != null ? String(row.fazenda) : null,
            pedido_municipio:
                row.pedido_municipio != null ? String(row.pedido_municipio) : null,
            pedido_uf: row.pedido_uf != null ? String(row.pedido_uf) : null,
            prazo_dias:
                row.prazo_dias != null ? Number(row.prazo_dias) : 14,
            created_at: String(row.created_at),
            updated_at: String(row.updated_at),
        },
        client,
        items,
        vendedorNome: null,
    };
}
export async function fetchSimulationOrderBundle(simulationId) {
    const { data, error } = await supabase
        .from('simulations')
        .select(`
      id,
      user_id,
      client_id,
      total_bruto,
      total_proposta,
      status,
      tipo_frete,
      origem_frete,
      destino_frete,
      data_pagamento,
      quarter,
      observacoes,
      fazenda,
      pedido_municipio,
      pedido_uf,
      prazo_dias,
      created_at,
      updated_at,
      clients (
        id,
        nome,
        razao_social,
        cnpj_cpf,
        email,
        telefone,
        endereco,
        cep,
        logradouro,
        bairro,
        municipio,
        uf
      ),
      simulation_items (
        id,
        product_id,
        volume,
        preco_unitario,
        proposta,
        cultura,
        override_custo_usd,
        override_desconto_usd,
        override_taxa,
        override_frete,
        override_taxa_antecipacao,
        override_taxa_juros,
        produtos_oficiais ( nome )
      )
    `)
        .eq('id', simulationId)
        .maybeSingle();
    if (error) {
        return { ok: false, error: error.message };
    }
    if (!data) {
        return { ok: false, error: 'Simulação não encontrada.' };
    }
    const bundle = parseBundle(data);
    if (!bundle) {
        return { ok: false, error: 'Dados da simulação incompletos.' };
    }

    let vendedorNome = null;
    if (bundle.simulation.user_id) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('nome')
            .eq('id', bundle.simulation.user_id)
            .maybeSingle();
        if (profile?.nome) {
            vendedorNome = String(profile.nome);
        }
    }

    return { ok: true, data: { ...bundle, vendedorNome } };
}
export async function searchClients(query, signal) {
    let q = supabase
        .from('clients')
        .select('id, nome, cnpj_cpf, uf, municipio, email, telefone')
        .eq('ativo', true)
        .order('nome', { ascending: true })
        .limit(8);
    const text = (query ?? '').trim();
    if (text) {
        q = q.ilike('nome', `%${text}%`);
    }
    const { data, error } = signal ? await q.abortSignal(signal) : await q;
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: data ?? [] };
}

export async function saveDraftSimulation(input) {
    const auth = await requireAuthUser();
    if (!auth.ok) return auth;
    if (input.lines.length === 0) {
        return { ok: false, error: 'Inclua ao menos um produto na simulação.' };
    }
    if (input.lines.some((line) => !line.productId)) {
        return { ok: false, error: 'Selecione o produto em todas as linhas.' };
    }
    return upsertSimulationWithItems(input, 'draft', auth.user.id);
}

export async function persistApprovedSimulation(input) {
    const auth = await requireAuthUser();
    if (!auth.ok) return auth;
    if (input.lines.length === 0) {
        return { ok: false, error: 'Inclua ao menos um produto na simulação.' };
    }
    if (input.lines.some((line) => !line.productId)) {
        return { ok: false, error: 'Selecione o produto em todas as linhas.' };
    }
    return upsertSimulationWithItems(input, 'approved', auth.user.id);
}

export async function persistConvertedSimulation(input) {
    const auth = await requireAuthUser();
    if (!auth.ok) return auth;
    if (input.lines.length === 0) {
        return { ok: false, error: 'Inclua ao menos um produto na simulação.' };
    }
    if (input.lines.some((line) => !line.productId)) {
        return { ok: false, error: 'Selecione o produto em todas as linhas.' };
    }
    if (input.simulationId) {
        const { data: existing, error: fetchError } = await supabase
            .from('simulations')
            .select('id, status')
            .eq('id', input.simulationId)
            .maybeSingle();
        if (fetchError) return { ok: false, error: fetchError.message };
        if (existing?.status === 'converted') {
            return { ok: true, simulationId: input.simulationId, alreadyConverted: true };
        }
    }
    return upsertSimulationWithItems(input, 'converted', auth.user.id);
}

export async function savePendingSimulation(input) {
    const auth = await requireAuthUser();
    if (!auth.ok) return auth;
    if (input.lines.length === 0) {
        return { ok: false, error: 'Inclua ao menos um produto na simulação.' };
    }
    if (input.lines.some((line) => !line.productId)) {
        return { ok: false, error: 'Selecione o produto em todas as linhas.' };
    }
    return upsertSimulationWithItems(input, 'pending', auth.user.id);
}

export async function saveGestorReview(input) {
    const auth = await requireAuthUser();
    if (!auth.ok) return auth;
    if (!input.simulationId) {
        return { ok: false, error: 'Simulação inválida.' };
    }
    const { data: simRow, error: simFetchError } = await supabase
        .from('simulations')
        .select('id, user_id, status')
        .eq('id', input.simulationId)
        .maybeSingle();
    if (simFetchError) return { ok: false, error: simFetchError.message };
    if (!simRow) return { ok: false, error: 'Simulação não encontrada.' };

    const simUpdate = {
        total_bruto: roundMoney(input.totalValor),
        total_proposta: roundMoney(input.totalProposta),
    };
    if (input.comissaoValorTotal != null) {
        simUpdate.comissao_valor_total = roundMoney(input.comissaoValorTotal);
    }

    const { error: simError } = await supabase
        .from('simulations')
        .update(simUpdate)
        .eq('id', input.simulationId);
    if (simError) {
        return { ok: false, error: simError.message };
    }
    for (const line of input.lines) {
        if (!line.id) continue;
        const { error: itemError } = await supabase
            .from('simulation_items')
            .update({
            preco_unitario: roundMoney(line.precoUnitario),
            proposta: roundMoney(line.proposta),
            produto_classe: line.produtoClasse ?? line.classe ?? null,
            margem_percentual:
                line.margemPercentual != null
                    ? Number(line.margemPercentual)
                    : null,
            comissao_percentual:
                line.comissaoPercentual != null
                    ? Number(line.comissaoPercentual)
                    : null,
            comissao_valor:
                line.comissaoValor != null
                    ? roundMoney(line.comissaoValor)
                    : null,
            ...buildOverrideFields(line.overrides, auth.user.id),
        })
            .eq('id', line.id)
            .eq('simulation_id', input.simulationId);
        if (itemError) {
            return { ok: false, error: itemError.message };
        }
    }

    const comissaoResult = await syncComissaoForSimulation(
        input.simulationId,
        simRow.user_id,
        simRow.status === 'converted' ? 'converted' : 'approved',
        input.lines,
    );
    if (!comissaoResult.ok) return comissaoResult;

    return { ok: true, simulationId: input.simulationId };
}

export async function updateSimulationStatus(simulationId, status, options = {}) {
    const { data: existing, error: fetchError } = await supabase
        .from('simulations')
        .select('id, status')
        .eq('id', simulationId)
        .maybeSingle();
    if (fetchError) return { ok: false, error: fetchError.message };
    if (!existing) return { ok: false, error: 'Simulação não encontrada.' };

    if (existing.status === 'converted') {
        return { ok: true, alreadyConverted: true };
    }
    if (existing.status === status) {
        return { ok: true };
    }

    const { error } = await supabase
        .from('simulations')
        .update({ status })
        .eq('id', simulationId);
    if (error)
        return { ok: false, error: error.message };
    if (options.notifyConsultor && (status === 'approved' || status === 'rejected')) {
        const type = status === 'approved' ? 'simulation_approved' : 'simulation_rejected';
        const clientLabel = options.clientName?.trim() || 'Cliente';
        const title = status === 'approved'
            ? `Simulação aprovada — ${clientLabel}`
            : `Simulação reprovada — ${clientLabel}`;
        const notifyResult = await notifyConsultorSimulationDecision({
            simulationId,
            type,
            title,
            body: options.body ?? null,
        });
        if (!notifyResult.ok)
            return notifyResult;
    }
    if (status === 'converted' || status === 'approved') {
        const comissaoResult = await syncComissaoRegistroFromSimulation(
            simulationId,
            { status: status === 'converted' ? 'confirmada' : 'calculada' },
        );
        if (!comissaoResult.ok) return comissaoResult;
    }
    return { ok: true };
}
export async function fetchSimulationsList(params) {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 50))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const search = (params.search ?? '').trim()

    let q = supabase
        .from('simulations')
        .select(`
      id,
      created_at,
      total_proposta,
      status,
      user_id,
      clients ( nome )
    `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to)

    if (params.role === 'consultor') {
        q = q.eq('user_id', params.userId)
    }
    if (params.statusFilter) {
        q = q.eq('status', params.statusFilter)
    } else if (params.excludeConverted) {
        q = q.neq('status', 'converted')
    }

    if (search) {
        const pattern = `%${search.replace(/[%_,]/g, ' ').trim()}%`
        if (params.role === 'gestor') {
            const { data: profs } = await supabase
                .from('profiles')
                .select('id')
                .ilike('nome', pattern)
            const consultorIds = (profs ?? []).map((p) => p.id)
            if (consultorIds.length > 0) {
                q = q.or(`clients.nome.ilike.${pattern},user_id.in.(${consultorIds.join(',')})`)
            } else {
                q = q.ilike('clients.nome', pattern)
            }
        } else {
            q = q.ilike('clients.nome', pattern)
        }
    }

    const { data, error, count } = await q
    if (error)
        return { ok: false, error: error.message }
    const raw = (data ?? [])
    const rows = raw.map((row) => {
        const rawClient = row.clients
        const clientRow = Array.isArray(rawClient) ? rawClient[0] : rawClient
        const nome = clientRow && typeof clientRow === 'object' && 'nome' in clientRow
            ? String(clientRow.nome ?? '')
            : ''
        return {
            id: String(row.id),
            created_at: String(row.created_at),
            client_nome: nome,
            total_proposta: Number(row.total_proposta),
            status: row.status,
            user_id: String(row.user_id),
        }
    })
    let consultorNomeById = {}
    if (params.role === 'gestor' && rows.length > 0) {
        const ids = [...new Set(rows.map((r) => r.user_id))]
        const { data: profs, error: pErr } = await supabase
            .from('profiles')
            .select('id, nome')
            .in('id', ids)
        if (pErr)
            return { ok: false, error: pErr.message }
        consultorNomeById = Object.fromEntries((profs ?? []).map((p) => [String(p.id), String(p.nome)]))
    }
    return { ok: true, rows, consultorNomeById, total: count ?? 0 }
}

export async function fetchGestorDashboardStats() {
    const [pendingRes, approvedRes, clientsRes, consultoresRes] = await Promise.all([
        supabase.from('simulations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('simulations').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'consultor'),
    ]);
    if (pendingRes.error)
        return { ok: false, error: pendingRes.error.message };
    if (approvedRes.error)
        return { ok: false, error: approvedRes.error.message };
    if (clientsRes.error)
        return { ok: false, error: clientsRes.error.message };
    if (consultoresRes.error)
        return { ok: false, error: consultoresRes.error.message };
    return {
        ok: true,
        stats: {
            pendingCount: pendingRes.count ?? 0,
            approvedCount: approvedRes.count ?? 0,
            clientsCount: clientsRes.count ?? 0,
            consultoresCount: consultoresRes.count ?? 0,
        },
    };
}

export async function fetchConsultorDashboardStats(userId) {
    const [draftRes, pendingRes, approvedRes, convertedRes] = await Promise.all([
        supabase
            .from('simulations')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'draft'),
        supabase
            .from('simulations')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'pending'),
        supabase
            .from('simulations')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'approved'),
        supabase
            .from('simulations')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'converted'),
    ]);
    for (const res of [draftRes, pendingRes, approvedRes, convertedRes]) {
        if (res.error) return { ok: false, error: res.error.message };
    }
    return {
        ok: true,
        stats: {
            draftCount: draftRes.count ?? 0,
            pendingCount: pendingRes.count ?? 0,
            approvedCount: approvedRes.count ?? 0,
            convertedCount: convertedRes.count ?? 0,
        },
    };
}

export async function updateClientDeliveryFields(input) {
    const { error } = await supabase
        .from('clients')
        .update({
        cep: input.cep,
        logradouro: input.logradouro,
        bairro: input.bairro,
        municipio: input.municipio,
        uf: input.uf,
    })
        .eq('id', input.clientId);
    if (error)
        return { ok: false, error: error.message };
    return { ok: true };
}

/**
 * Persiste os dados obrigatórios da tela de pedido.
 * @param {{
 *   simulationId: string,
 *   fazenda: string,
 *   pedidoMunicipio: string,
 *   pedidoUf: string,
 *   prazoDias: number,
 * }} input
 */
export async function updatePedidoFields(input) {
    const fazenda = String(input.fazenda ?? '').trim()
    const pedidoMunicipio = String(input.pedidoMunicipio ?? '').trim()
    const pedidoUf = String(input.pedidoUf ?? '').trim().toUpperCase()
    const prazoDias = Number(input.prazoDias)

    if (!fazenda) {
        return { ok: false, error: 'Informe o nome da fazenda.' }
    }
    if (!pedidoMunicipio) {
        return { ok: false, error: 'Selecione o município.' }
    }
    if (!['MG', 'SP'].includes(pedidoUf)) {
        return { ok: false, error: 'Selecione o estado (MG ou SP).' }
    }
    if (![7, 14, 21].includes(prazoDias)) {
        return { ok: false, error: 'Prazo inválido. Use 7, 14 ou 21 dias.' }
    }

    const { error } = await supabase
        .from('simulations')
        .update({
            fazenda,
            pedido_municipio: pedidoMunicipio,
            pedido_uf: pedidoUf,
            prazo_dias: prazoDias,
            updated_at: new Date().toISOString(),
        })
        .eq('id', input.simulationId)

    if (error) return { ok: false, error: error.message }
    return { ok: true }
}
