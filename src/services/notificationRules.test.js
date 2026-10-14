import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LISTA_TITLES,
  consultorRecipient,
  gestorRecipients,
  notificationWritePlan,
  planListaNotifications,
} from "./notificationRules";

const gestorA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const gestorB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const consultor = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const lista = {
  fornecedorId: "forn-1",
  fornecedorNome: "Yara",
  quarter: "Q1",
  estado: "MG",
};

function lote(partial) {
  return { kind: "lote", ...lista, ...partial };
}

function produto(partial) {
  return { kind: "produto", ...lista, ...partial };
}

describe("público da simulação", () => {
  it("avisa os gestores quando o consultor pede aprovação, e não inclui o autor", () => {
    expect(gestorRecipients([gestorA, gestorB, gestorA], consultor)).toEqual([
      gestorA,
      gestorB,
    ]);
  });

  it("não avisa o gestor sobre a alteração que ele mesmo fez", () => {
    expect(gestorRecipients([gestorA, gestorB], gestorA)).toEqual([gestorB]);
    expect(consultorRecipient(gestorA, "gestor", gestorA)).toBeNull();
  });

  it("avisa o consultor quando a simulação é aprovada por outro usuário", () => {
    expect(consultorRecipient(consultor, "consultor", gestorA)).toBe(consultor);
  });

  it("não avisa gestor nem o próprio consultor como se fossem o público da aprovação", () => {
    expect(consultorRecipient(gestorB, "gestor", gestorA)).toBeNull();
    expect(consultorRecipient(consultor, "consultor", consultor)).toBeNull();
    expect(consultorRecipient(consultor, "logistica", gestorA)).toBeNull();
  });
});

describe("um evento, um registro e um push", () => {
  it("não grava de novo quando a não lida já tem o mesmo texto", () => {
    expect(
      notificationWritePlan({ identicalUnread: true, differentUnread: false }),
    ).toBe("skip");
  });

  it("substitui a não lida quando o texto mudou, gerando um único insert", () => {
    expect(
      notificationWritePlan({ identicalUnread: false, differentUnread: true }),
    ).toBe("replace");
  });

  it("insere a primeira notificação do evento", () => {
    expect(
      notificationWritePlan({ identicalUnread: false, differentUnread: false }),
    ).toBe("insert");
  });
});

describe("lista de produtos", () => {
  it("descreve a chegada de produtos novos", () => {
    const messages = planListaNotifications([
      lote({
        loteId: "novo",
        oldStatus: "aguardando_validacao",
        newStatus: "concluido",
        oldAtivo: true,
        newAtivo: true,
      }),
      produto({ op: "insert", newLoteId: "novo", produtoNome: "MAP" }),
      produto({ op: "insert", newLoteId: "novo", produtoNome: "UREIA" }),
    ]);

    expect(messages).toEqual([
      {
        title: LISTA_TITLES.chegada,
        body: "Chegaram 2 produtos novos na lista de Yara · Q1 · MG.",
      },
    ]);
  });

  it("separa chegada e saída quando a lista nova substitui a anterior", () => {
    const messages = planListaNotifications([
      lote({
        loteId: "novo",
        oldStatus: "aguardando_validacao",
        newStatus: "concluido",
        oldAtivo: true,
        newAtivo: true,
      }),
      produto({ op: "insert", newLoteId: "novo", produtoNome: "MAP" }),
      lote({
        loteId: "antiga",
        oldStatus: "concluido",
        newStatus: "concluido",
        oldAtivo: true,
        newAtivo: false,
      }),
      produto({
        op: "ativo",
        loteId: "antiga",
        oldLoteId: "antiga",
        newLoteId: "antiga",
        oldProdutoAtivo: true,
        newProdutoAtivo: false,
        produtoNome: "KCL",
      }),
    ]);

    expect(messages.map((message) => message.title)).toEqual([
      LISTA_TITLES.chegada,
      LISTA_TITLES.saida,
    ]);
    expect(messages[1].body).toBe(
      "1 produto saiu da lista de Yara · Q1 · MG porque ela foi substituída.",
    );
  });

  it("descreve a inativação da lista sem repetir cada produto", () => {
    const messages = planListaNotifications([
      lote({
        loteId: "lista",
        oldStatus: "concluido",
        newStatus: "concluido",
        oldAtivo: true,
        newAtivo: false,
      }),
      produto({
        op: "ativo",
        loteId: "lista",
        newLoteId: "lista",
        oldProdutoAtivo: true,
        newProdutoAtivo: false,
        produtoNome: "MAP",
      }),
      produto({
        op: "ativo",
        loteId: "lista",
        newLoteId: "lista",
        oldProdutoAtivo: true,
        newProdutoAtivo: false,
        produtoNome: "UREIA",
      }),
    ]);

    expect(messages).toEqual([
      {
        title: LISTA_TITLES.inativada,
        body: "A lista de Yara · Q1 · MG foi inativada. 2 produtos saíram do catálogo.",
      },
    ]);
  });

  it("descreve a exclusão, inclusive quando os produtos em uso só são inativados", () => {
    const messages = planListaNotifications(
      [
        lote({
          loteId: "lista",
          oldStatus: "concluido",
          newStatus: "concluido",
          oldAtivo: true,
          newAtivo: false,
        }),
        produto({
          op: "ativo",
          loteId: "lista",
          newLoteId: "lista",
          oldProdutoAtivo: true,
          newProdutoAtivo: false,
          produtoNome: "MAP",
        }),
        produto({
          op: "delete",
          loteId: "lista",
          produtoNome: "UREIA",
        }),
      ],
      { motivo: "exclusao" },
    );

    expect(messages).toEqual([
      {
        title: LISTA_TITLES.excluida,
        body: "A lista de Yara · Q1 · MG foi excluída. 1 produto em uso foi inativado e 1 produto foi removido do catálogo.",
      },
    ]);
  });

  it("descreve a exclusão quando a lista é removida", () => {
    const messages = planListaNotifications([
      {
        kind: "lote_delete",
        ...lista,
        loteId: "lista",
        oldStatus: "concluido",
      },
      produto({ op: "delete", loteId: "lista", produtoNome: "MAP" }),
    ]);

    expect(messages[0].title).toBe(LISTA_TITLES.excluida);
    expect(messages[0].body).toContain("foi excluída");
    expect(messages).toHaveLength(1);
  });

  it("descreve produto novo, inativado, reativado e excluído fora de uma operação de lista", () => {
    expect(
      planListaNotifications([
        produto({
          op: "insert",
          newLoteId: null,
          loteId: null,
          produtoNome: "MAP",
        }),
      ])[0].title,
    ).toBe(LISTA_TITLES.produtoNovo);

    expect(
      planListaNotifications([
        produto({
          op: "ativo",
          loteId: "lista",
          newLoteId: "lista",
          oldProdutoAtivo: true,
          newProdutoAtivo: false,
          produtoNome: "UREIA",
        }),
      ])[0],
    ).toMatchObject({
      title: LISTA_TITLES.produtoInativado,
      body: "O produto UREIA foi inativado e saiu da lista de Yara · Q1 · MG.",
    });

    expect(
      planListaNotifications([
        produto({
          op: "ativo",
          loteId: "lista",
          newLoteId: "lista",
          oldProdutoAtivo: false,
          newProdutoAtivo: true,
          produtoNome: "KCL",
        }),
      ])[0].title,
    ).toBe(LISTA_TITLES.produtoReativado);

    expect(
      planListaNotifications([
        produto({ op: "delete", loteId: "lista", produtoNome: "SSP" }),
      ])[0].title,
    ).toBe(LISTA_TITLES.produtoExcluido);
  });

  it("não gera notificação quando não houve alteração relevante", () => {
    expect(planListaNotifications([])).toEqual([]);
  });
});

describe("migration alinhada à regra", () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL(
        "../../supabase/migrations/20261013180000_notificacoes_mesmo_publico.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );

  it("grava os mesmos títulos e mantém o push no insert da notificação interna", () => {
    for (const title of Object.values(LISTA_TITLES)) {
      expect(sql).toContain(title);
    }
    expect(sql).toContain("IS DISTINCT FROM auth.uid()");
    expect(sql).toContain("is_consultor()");
    expect(sql).toContain("p.role = 'gestor'::public.user_role");
    expect(sql).toContain("p.role = 'consultor'::public.user_role");
    expect(sql).toContain("aval.lista_motivo");
    expect(sql).toContain("'exclusao'");
    expect(sql).toContain("price_list_changed");
    expect(sql).toContain(
      "DROP TRIGGER IF EXISTS lotes_importacao_notify_consultores",
    );
    expect(sql).not.toContain(
      "DROP TRIGGER IF EXISTS notifications_enqueue_web_push",
    );
    expect(sql).toContain("INSERT INTO public.notifications");
  });
});
