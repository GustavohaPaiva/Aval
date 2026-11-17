# Dashboard do Aval — o que a tela consulta

Atualizado em 2026-11-12. O PDF continua sendo a regra de cálculo. Pedidos convertidos e ativos entram sem depender de compra ao fornecedor. A migration `20261106193000_dashboard_vendas_gestor.sql` cria a estrutura do painel.

## O que entra na base
- Pedido: status `converted` e `ativo`. Volume e faturamento vêm dos itens do próprio pedido.
- Data: `simulations.data_negociacao` quando preenchida; senão, o dia de `created_at`. A conversão em pedido grava `data_negociacao` uma vez; edição posterior não altera.
- Compra: opcional. Sem compra, ou com compra sem preço unitário, a linha entra uma vez pelo volume e pelo valor do item. Com lastro em `alocacoes` até `compra_itens.pagamento_syagri` e `unitario_brl`, o volume comprado repartilha fornecedores. Compra parcial mantém o restante na base.
- Custo com e sem ICMS: só `custo_brl_unitario` e `custo_icms_unitario` quando existem. Catálogo, margem da simulação e `financeiro_unitario` não substituem a margem líquida.
- Filial da venda: só `filial_venda`. `profiles.filial` não vira loja.
- Caixa: só linha com status de lançamento conhecido e igual a lançado. Sem a coluna, o caixa informa a ausência em vez de zerar o saldo.
- Dólar do painel: só o parâmetro gravado. A cotação de `cotacoes_moeda` aparece como cotação vigente e não divide a receita líquida.
- Família/custo e meta: só quando o cadastro existe e tem registro.
- Pedido com total divergente dos itens permanece na base pela soma dos itens, com aviso, e não derruba o restante.

## O que a tela faz quando o dado falta
Mostra “—” ou um estado vazio. Não explica coluna, tabela, cadastro ou carga pendente. Não transforma ausência em zero. Erro de consulta continua na mensagem operacional. O filtro de ano não abre pré-selecionado.

## Lacunas
Se a carga histórica já estiver gravada, o painel a lê. Ela não foi copiada para o banco oficial. Margem, filial, safra, tipo de venda e caixa ficam vazios quando o campo não está preenchido. Não há meta cadastrada. Juros, frete, comissões, preços unitários e margens brutas da planilha não têm coluna.

## Regras que não mudaram
Margem, deduplicação entre planilhas, cancelamento por volume e faturamento zerados e os seis exemplos do PDF continuam nos testes de `src/utils/salesDashboard.js`.
