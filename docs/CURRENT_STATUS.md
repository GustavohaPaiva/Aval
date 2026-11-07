# Estado atual — 2026-11-06, revisão do dashboard

## Verificado nesta revisão
Os cálculos do PDF que já estavam nos testes continuam passando: margem líquida, deduplicação, cancelamento e os exemplos de `src/utils/salesDashboard.js`, mais a consulta e os fatos nativos. São 34 testes desse conjunto.

A suíte completa ficou em 223 testes passando e 5 falhando. As cinco falhas abrem planilhas em `Planilhas de Fornecedores/`, pasta ausente no disco e ignorada no Git. Esses testes não foram alterados por esta entrega.

O lint dos arquivos da entrega não apontou erro novo. `useSimulation.js` e `Simulador.jsx` seguem com alertas anteriores (`no-extra-boolean-cast`, `set-state-in-effect`, atualização de ref no render). `vite build` concluiu. O aviso de chunk grande de PDF e planilha já existia.

Sem sessão de gestor, o painel autenticado não foi percorrido. Em `http://127.0.0.1:5175`, `/dashboard` sem sessão vai para `/login`, também ao abrir de novo. O login no celular empilha o formulário. Essa rota não registrou falha de rede.

O cliente usa a chave anônima. As tabelas novas têm RLS por `is_gestor()`. A gravação de data de negociação, filial, safra, tipo, lançamento e custo congelado só ocorre se a coluna existir. A carga de teste não entra no commit: planilha, referências e `.env` ficam de fora. O repositório é público; totais comerciais da carga não foram versionados.

A aplicação publicada hoje aponta para o projeto Syagri de produção, não para Syagri-Test. A migration `20261106193000` está só no teste. O painel trata tabela ou coluna ausente e não transforma essa ausência em zero.

## O que a tela cobre
Gestor: visão geral, semana, fluxo de caixa, comparativo anual, consultores e margem contra a média. Atalhos para pendentes, aprovadas, clientes e consultores. Filtros e navegação não ficam abertos juntos. Consultor mantém os cartões anteriores. Logística segue para a própria área.

## Pendências conhecidas
Pedidos nativos ficam fora da base enquanto `data_negociacao` e o lastro da compra (`pagamento_syagri` e `unitario_brl`) estiverem vazios. Não há lançamento linha a linha de 2024. O histórico não tem id de cliente, fornecedor, consultor ou produto. Juros, frete, comissões, preços unitários e margens brutas da planilha não têm coluna. Não há meta cadastrada. A animação dos filtros, a reabertura em 60 segundos, o botão Atualizar e a troca de abas ainda dependem de uma sessão de gestor.

## Publicação
O destino existente é o push da `main`, que dispara o GitHub Pages em https://aval-fertilizantes.online. Não há aplicativo Heroku configurado e nenhum foi criado. A migration não foi aplicada em produção e a carga de teste não foi copiada.

Alterações locais de logística ficaram de fora deste commit.

## Próxima etapa
Auditoria de segurança, capacidade para mais usuários e padronização do código. Antes de propor essa padronização, analisar o projeto Aivo. A organização de arquivos, estilos e textos não foi definida agora.
