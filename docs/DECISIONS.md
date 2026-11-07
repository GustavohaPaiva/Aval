# Decisões

## 2026-11-06 — Contexto no repositório
Usar Markdown dentro do projeto como contexto persistente compartilhado. AGENTS.md orienta a leitura; uma regra pequena do Cursor aponta para a mesma fonte, evitando duplicar as instruções completas.

## 2026-11-06 — Entrega incremental
Priorizar o Aval. Não construir agora uma plataforma de agentes, sincronizador ou memória externa. Reutilizar a estrutura em outros projetos depois de validá-la aqui.

## 2026-11-06 — Limite desta etapa
Somente inspeção e documentação. Preservar o trabalho local e não publicar referências do cliente ou configurações potencialmente sensíveis. Decisões funcionais do dashboard dependem de análise das referências.

## 2026-11-06 — Primeira implementação do dashboard
O usuário autorizou avançar na implementação. Manter pedidos nativos e histórico GEFERT em fontes separadas, sem somar bases potencialmente sobrepostas. A referência normativa é o PDF; o HTML contém regras antigas. Nos pedidos nativos, não presumir margem líquida nem data de faturamento a partir do cadastro da proposta. Manter o painel de gestor somente leitura, retirando a expiração de rascunhos da sua consulta de contagens.

## 2026-11-06 — Dashboard sem inventar o que o banco não tem
A tela consulta o que já está em Syagri-Test e nomeia a lacuna quando o campo não existe. Não usar `created_at` como data de negociação, `profiles.filial` como filial da venda, a margem da simulação como margem líquida, nem a cotação vigente como dólar de referência do painel. Meta e família/custo só contam com cadastro gravado. A migration do dashboard e a carga histórica permanecem propostas, sem aplicação nesta etapa.

## 2026-11-06 — Lacunas fora da tela do gestor
O painel não nomeia campo, tabela ou carga pendente. Ausência fica como “—” ou estado vazio; o detalhe vai para o registro e para a conversa. A migration `20261106193000_dashboard_vendas_gestor.sql` continua sem aplicação. O histórico GEFERT não entra em `simulations` nem em compras: faltam as colunas da venda e os vínculos (`user_id`, `client_id`, `product_id`), e um pedido convertido cairia na operação. Sem a tabela de histórico, a carga não é gravada.

## 2026-11-06 — Dashboard com origem operacional
Pedido convertido não entra na base de vendas. Entra a linha com `simulations.data_negociacao` e lastro em `alocacoes` ligado a compra com `pagamento_syagri` e `unitario_brl`. Volume e faturamento seguem a quantidade alocada, em toneladas, sem repetir a venda quando há mais de um fornecedor ou lote. `created_at` deixa de ser tratado como data da negociação. Custo com e sem ICMS vem de `simulation_items.custo_brl_unitario` e `custo_icms_unitario`, gravados no save; o catálogo atual não recalcula o passado. `data_pagamento` é o vencimento do cliente. Filial da venda é `filial_venda`, com fallback em `profiles.filial`; filial da compra não substitui a loja. Caixa usa só `status_lancamento = lancado` e o custo sem ICMS. A planilha GEFERT é carga histórica persistida e não soma linha já coberta pelo Aval. Metas, família/custo, de-para, dólar e alíquotas por vigência são cadastro do gestor. A migration está escrita e não foi aplicada.

## 2026-11-06 — Duas sidebars no dashboard
No dashboard, a navegação e os filtros não ficam abertos ao mesmo tempo. A entrada recolhe a navegação e abre os filtros. Abrir uma recolhe a outra. Recolher uma não abre a outra. A preferência gravada da navegação só muda fora do dashboard. Em telas menores, os dois painéis são sobrepostos e seguem a mesma exclusividade.

## 2026-11-06 — Filtros do dashboard pelo cadastro
Cliente, fornecedor, consultor e produto filtram pelo id do cadastro. Nome repetido não junta registros. O histórico GEFERT não tem esses ids: sem o filtro correspondente, as linhas continuam no painel; com o filtro, não são atribuídas por nome. Filial, tipo de venda, cultura e tipo de produto usam as listas oficiais. Ano, mês e safra saem das vendas carregadas. Safra não é um cadastro.

## 2026-11-06 — Carga do dashboard sem fila e com cache curto
O painel espera a rede, não o Postgres: a página de clientes levou 52 ms e o histórico 13 ms, enquanto idas em série levaram segundos. As consultas independentes partem juntas. O lastro entra no select do pedido; se o relacionamento falhar, a carga volta às consultas separadas. Cadastro com mais de mil linhas pede a contagem e busca o restante em paralelo; contagem maior que as linhas recebidas interrompe a carga. O cache dura 60 segundos, fica só na memória e é por usuário. Atualizar, sair da conta e gravar cliente, pedido, compra, produto, fornecedor, cotação ou cadastro do painel descartam o cache. Não houve índice nem outra mudança de banco: o plano não era o gargalo.

## 2026-11-06 — Histórico GEFERT só em Syagri-Test
O usuário autorizou rodar a migration e gravar a planilha no banco de teste. A versão `20261106193000` ficou registrada em Syagri-Test. As linhas elegíveis da aba GFERT vão para `dashboard_vendas_historicas`, amarradas ao arquivo em `dashboard_importacoes`. Repetir a carga apaga só as linhas daquele arquivo e grava de novo. Canceladas, linhas sem data e as outras abas ficam de fora. Campos sem coluna (juros, frete, comissões, preços unitários e margens brutas) não são inventados. O histórico não vira pedido, compra ou estoque. Produção não entra nessa autorização.

## 2026-11-06 — Publicação do dashboard
O destino já configurado é o GitHub Pages em https://aval-fertilizantes.online, disparado pelo push da `main`. Não há aplicativo Heroku no repositório e nenhum foi criado. A migration `20261106193000` continua aplicada só em Syagri-Test. O frontend publicado tolera tabela ou coluna ausente e não leva a carga histórica de teste para produção.

