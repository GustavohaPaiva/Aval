/**
 * Regras de público e de texto das notificações.
 * A gravação interna e o push usam o mesmo INSERT em public.notifications
 * (trigger notifications_enqueue_web_push). A migration
 * 20261013180000_notificacoes_mesmo_publico.sql segue estes textos e públicos.
 */

export const LISTA_TITLES = {
  chegada: "Chegada de novos produtos",
  atualizada: "Lista de produtos atualizada",
  lancada: "Lista de produtos lançada",
  saida: "Saída de produtos da lista",
  inativada: "Lista de produtos inativada",
  excluida: "Lista de produtos excluída",
  reativada: "Lista de produtos reativada",
  produtoNovo: "Novo produto na lista",
  produtoInativado: "Produto inativado",
  produtoReativado: "Produto reativado na lista",
  produtoExcluido: "Produto excluído da lista",
};

export function gestorRecipients(gestorIds, actorId) {
  const actor = actorId == null ? null : String(actorId);
  return [...new Set((gestorIds ?? []).map((id) => String(id)))].filter(
    (id) => id && id !== actor,
  );
}

/** Consultor dono da simulação, exceto quando ele mesmo executou a ação. */
export function consultorRecipient(ownerId, ownerRole, actorId) {
  if (ownerRole !== "consultor" || ownerId == null) return null;
  if (actorId != null && String(ownerId) === String(actorId)) return null;
  return String(ownerId);
}

/**
 * skip: já existe não lida idêntica — não grava de novo e não envia outro push.
 * replace: troca a não lida do mesmo evento — um INSERT, um push.
 * insert: primeira notificação do evento — um INSERT, um push.
 */
export function notificationWritePlan({ identicalUnread, differentUnread }) {
  if (identicalUnread) return "skip";
  if (differentUnread) return "replace";
  return "insert";
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

export function listaLabel(event) {
  const label = [event?.fornecedorNome, event?.quarter, event?.estado]
    .map(clean)
    .filter(Boolean)
    .join(" · ");
  return label || "Fornecedor";
}

function countLabel(count, singular, plural) {
  const total = Number(count) || 0;
  return `${total} ${total === 1 ? singular : plural}`;
}

function listaKey(event) {
  const fornecedor = event.fornecedorId
    ? `id:${event.fornecedorId}`
    : `nome:${clean(event.fornecedorNome).toLowerCase()}`;
  return `${fornecedor}|${clean(event.quarter).toLowerCase()}|${clean(event.estado).toUpperCase()}`;
}

function produtoNome(event) {
  return clean(event.produtoNome) || "Produto";
}

function produtosDoLote(products, loteId) {
  return products.filter(
    (product) =>
      product.loteId === loteId ||
      product.oldLoteId === loteId ||
      product.newLoteId === loteId,
  );
}

function saidaCount(products, loteId) {
  return produtosDoLote(products, loteId).filter(
    (product) =>
      product.op !== "insert" &&
      product.op !== "delete" &&
      product.oldProdutoAtivo === true &&
      product.newProdutoAtivo === false &&
      (product.newLoteId == null || product.newLoteId === loteId),
  ).length;
}

function novosCount(products, loteId) {
  return products.filter(
    (product) => product.op === "insert" && product.newLoteId === loteId,
  ).length;
}

function atualizadosCount(products, loteId) {
  return products.filter((product) => {
    if (product.op === "insert" || product.op === "delete") return false;
    const destino = product.newLoteId ?? product.loteId;
    if (destino !== loteId) return false;
    const veioDeOutra =
      product.oldLoteId != null && product.oldLoteId !== loteId;
    const reativadoAqui =
      product.oldProdutoAtivo === false && product.newProdutoAtivo === true;
    return veioDeOutra || reativadoAqui;
  }).length;
}

function voltaramCount(products, loteId) {
  return produtosDoLote(products, loteId).filter(
    (product) =>
      product.oldProdutoAtivo === false && product.newProdutoAtivo === true,
  ).length;
}

function removidosCount(products, loteId) {
  return products.filter(
    (product) => product.op === "delete" && product.loteId === loteId,
  ).length;
}

function isLaunch(event) {
  return (
    event.kind === "lote" &&
    event.newStatus === "concluido" &&
    event.newAtivo === true &&
    event.oldStatus !== "concluido"
  );
}

function isReactivate(event) {
  return (
    event.kind === "lote" &&
    event.oldStatus === "concluido" &&
    event.oldAtivo === false &&
    event.newAtivo === true &&
    event.newStatus === "concluido"
  );
}

function isTurnedOff(event) {
  return (
    event.kind === "lote" &&
    event.oldAtivo === true &&
    event.newAtivo === false &&
    event.oldStatus === "concluido"
  );
}

function eventLoteIds(product) {
  return [product.loteId, product.oldLoteId, product.newLoteId].filter(Boolean);
}

/**
 * Uma transação da lista vira uma ou mais notificações, sem repetir o produto
 * quando a mensagem da lista já cobre aquele lote.
 */
export function planListaNotifications(events, { motivo } = {}) {
  const rows = events ?? [];
  const lotes = rows.filter(
    (event) => event.kind === "lote" || event.kind === "lote_delete",
  );
  const products = rows.filter((event) => event.kind === "produto");
  const exclusao = motivo === "exclusao";
  const messages = [];
  const covered = new Set();
  const published = lotes.filter(
    (event) => isLaunch(event) || isReactivate(event),
  );

  for (const launch of lotes.filter(isLaunch)) {
    const label = listaLabel(launch);
    const novos = novosCount(products, launch.loteId);
    const atualizados = atualizadosCount(products, launch.loteId);
    covered.add(launch.loteId);
    if (novos > 0) {
      const extra =
        atualizados > 0
          ? ` ${countLabel(atualizados, "produto já existente foi atualizado", "produtos já existentes foram atualizados")}.`
          : "";
      messages.push({
        title: LISTA_TITLES.chegada,
        body: `Chegaram ${countLabel(novos, "produto novo", "produtos novos")} na lista de ${label}.${extra}`,
      });
    } else if (atualizados > 0) {
      messages.push({
        title: LISTA_TITLES.atualizada,
        body: `A lista de ${label} foi atualizada. ${countLabel(atualizados, "produto já existente foi atualizado", "produtos já existentes foram atualizados")} e nenhum produto novo chegou.`,
      });
    } else {
      messages.push({
        title: LISTA_TITLES.lancada,
        body: `A lista de ${label} foi lançada.`,
      });
    }
  }

  for (const reativada of lotes.filter(isReactivate)) {
    const label = listaLabel(reativada);
    const voltaram = voltaramCount(products, reativada.loteId);
    covered.add(reativada.loteId);
    messages.push({
      title: LISTA_TITLES.reativada,
      body: `A lista de ${label} foi reativada. ${countLabel(voltaram, "produto voltou", "produtos voltaram")} ao catálogo.`,
    });
  }

  for (const removed of lotes.filter((event) => event.kind === "lote_delete")) {
    if (removed.oldStatus !== "concluido") continue;
    covered.add(removed.loteId);
    const label = listaLabel(removed);
    const inativados = saidaCount(products, removed.loteId);
    const excluidos = removidosCount(products, removed.loteId);
    messages.push({
      title: LISTA_TITLES.excluida,
      body: `A lista de ${label} foi excluída. ${countLabel(inativados, "produto em uso foi inativado", "produtos em uso foram inativados")} e ${countLabel(excluidos, "produto foi removido", "produtos foram removidos")} do catálogo.`,
    });
  }

  for (const off of lotes.filter(isTurnedOff)) {
    if (covered.has(off.loteId)) continue;
    const label = listaLabel(off);
    const substituida =
      !exclusao &&
      published.some(
        (publishedLote) =>
          publishedLote.loteId !== off.loteId &&
          listaKey(publishedLote) === listaKey(off),
      );
    covered.add(off.loteId);
    if (exclusao) {
      const inativados = saidaCount(products, off.loteId);
      const excluidos = removidosCount(products, off.loteId);
      messages.push({
        title: LISTA_TITLES.excluida,
        body: `A lista de ${label} foi excluída. ${countLabel(inativados, "produto em uso foi inativado", "produtos em uso foram inativados")} e ${countLabel(excluidos, "produto foi removido", "produtos foram removidos")} do catálogo.`,
      });
    } else if (substituida) {
      const saida = saidaCount(products, off.loteId);
      messages.push({
        title: LISTA_TITLES.saida,
        body: `${countLabel(saida, "produto saiu", "produtos saíram")} da lista de ${label} porque ela foi substituída.`,
      });
    } else {
      const saida = saidaCount(products, off.loteId);
      messages.push({
        title: LISTA_TITLES.inativada,
        body: `A lista de ${label} foi inativada. ${countLabel(saida, "produto saiu", "produtos saíram")} do catálogo.`,
      });
    }
  }

  for (const product of products) {
    const ids = eventLoteIds(product);
    if (ids.some((id) => covered.has(id))) continue;
    const label = listaLabel(product);
    const nome = produtoNome(product);
    if (product.op === "insert") {
      messages.push({
        title: LISTA_TITLES.produtoNovo,
        body: `O produto ${nome} entrou na lista de ${label}.`,
      });
    } else if (product.op === "delete") {
      messages.push({
        title: LISTA_TITLES.produtoExcluido,
        body: `O produto ${nome} foi excluído da lista de ${label}.`,
      });
    } else if (
      product.oldProdutoAtivo === true &&
      product.newProdutoAtivo === false
    ) {
      messages.push({
        title: LISTA_TITLES.produtoInativado,
        body: `O produto ${nome} foi inativado e saiu da lista de ${label}.`,
      });
    } else if (
      product.oldProdutoAtivo === false &&
      product.newProdutoAtivo === true
    ) {
      messages.push({
        title: LISTA_TITLES.produtoReativado,
        body: `O produto ${nome} foi reativado na lista de ${label}.`,
      });
    }
  }

  return messages;
}
