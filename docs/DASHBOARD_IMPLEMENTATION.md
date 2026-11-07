# Dashboard do Aval — o que a tela consulta

Atualizado em 2026-11-06. O PDF continua sendo a regra. A migration `20261106193000_dashboard_vendas_gestor.sql` está aplicada e registrada em Syagri-Test. Produção não foi alterada.

## O que entra na base
- Data do pedido: somente `simulations.data_negociacao`, se a coluna existir. `created_at` não entra no período.
- Compra: `alocacoes` até `compra_itens.pagamento_syagri` e `unitario_brl`, também quando o lastro é um lote nascido de compra. A consulta dessas tabelas acontece mesmo sem as colunas novas do pedido.
- Volume: toneladas da venda; alocação em kg convertida por 1000. Compra parcial e vários fornecedores repartem faturamento e volume.
- Custo com e sem ICMS: só `custo_brl_unitario` e `custo_icms_unitario` quando essas colunas existem. Catálogo, margem da simulação e `financeiro_unitario` não substituem a margem líquida.
- Filial da venda: só `filial_venda`. `profiles.filial` não vira loja.
- Caixa: só linha com status de lançamento conhecido e igual a lançado. Sem a coluna, o caixa informa a ausência em vez de zerar o saldo.
- Dólar do painel: só o parâmetro gravado. A cotação de `cotacoes_moeda` aparece como cotação vigente e não divide a receita líquida.
- Família/custo e meta: só quando o cadastro existe e tem registro. Lista vazia ou tabela ausente não significa “ninguém é exceção”.

## O que a tela faz quando o dado falta
Mostra “—” ou um estado vazio. Não explica coluna, tabela, cadastro ou carga pendente. Não transforma ausência em zero. Erro de consulta continua na mensagem operacional.

## Lacunas conferidas em Syagri-Test
As colunas da venda e as tabelas do dashboard existem em Syagri-Test. O histórico GEFERT da aba de lançamentos está gravado nesse ambiente; os totais comerciais ficam fora do repositório. Pedidos nativos ainda não entram na base enquanto `data_negociacao` e o lastro da compra estiverem vazios. `pagamento_syagri` existe e segue sem preenchimento. Não há meta cadastrada. Não há lançamento linha a linha de 2024. Juros, frete, comissões, preços unitários e margens brutas da planilha não têm coluna e não foram gravados.

## Regras que não mudaram
Margem, deduplicação entre planilhas, cancelamento por volume e faturamento zerados e os seis exemplos do PDF continuam nos testes de `src/utils/salesDashboard.js`.
