# Estado atual — 2026-11-19, dólar negociado no pedido ao fornecedor

## Verificado nesta revisão
25 testes de preço da ordem de compra e da mensagem passaram. No Syagri oficial, o papel `financeiro`, as tabelas de recebimento, o aviso de vencimento, o cron `financeiro_aviso_vencimento` e a coluna `compra_itens.taxa_dolar` existem. As 63 compras do oficial continuam com o dólar vazio. Nenhum recebimento foi gravado. A tela autenticada não foi percorrida: a ordem abre o login.

## O que mudou
O dólar do pedido ao fornecedor sai da negociação: o câmbio gravado na linha ou o custo em reais congelado naquela venda. A cotação do dia não preenche. Sem esse registro, o campo fica vazio e a tela avisa. O valor salvo no item, inclusive edição manual, prevalece ao reabrir. Pedido antigo com unitário em reais mantém o dólar implícito nesse valor. PDF e mensagem mostram o dólar efetivo.

## O que entrou no oficial
As migrations locais posteriores a `20261111230000`: papel financeiro, recebimentos, tipo `pagamento_vencimento`, aviso de vencimento e dólar negociado. A política de `public.products` só é recriada se a tabela existir; no oficial ela não existe. Migrations antigas, já aplicadas com outro número, não foram reexecutadas.

## Próxima etapa
Entrar como gestor, abrir um pedido de compra ligado a uma negociação e conferir o dólar, uma edição manual e o PDF.

# Estado atual — 2026-11-19, lançamento único da lista Cibra

## Verificado nesta revisão
8 testes novos de lançamento por quarter passaram. O lint dos arquivos alterados ficou limpo. A tela autenticada não foi percorrida: o lançamento exige sessão de gestor. Nenhum lote foi gravado no Syagri-Test. O banco oficial não foi alterado.

## O que mudou
Planilha com mais de um quarter continua gerando uma lista por quarter. O botão de lançamento publica todas de uma vez, cada produto no quarter da própria lista. Quarter já concluído não é enviado de novo. Se a gravação de um quarter falha, os seguintes não entram e a nova tentativa continua só o que falta. Lista de um quarter só, e os demais fornecedores, seguem o lançamento de um lote.

## Pendências
Conferir na tela, com uma planilha Cibra de dois quarters, se um clique publica as duas listas.

## Próxima etapa
Entrar como gestor, importar a lista da Cibra e lançar os quarters juntos.

# Estado atual — 2026-11-19, alinhamento da tabela de comissões

## Verificado nesta revisão
Cabeçalhos e valores da tabela de comissões ficam centralizados no desktop, e o cartão do mobile empilha os mesmos campos no centro. Cálculo, filtro e Excel não mudaram. A tela autenticada não foi percorrida: `/comissao` abre o login.

## Próxima etapa
Entrar como gestor e conferir a tabela no desktop e o cartão no celular.

# Estado atual — 2026-11-19, Excel de comissões por produto

## Verificado nesta revisão
11 testes de exportação passaram, junto com os de situação financeira. As cinco falhas da suíte são `ENOENT` ao abrir arquivos em `Planilhas de Fornecedores/`, pasta ignorada pelo Git e ausente no disco. Os demais testes desses arquivos passaram. O lint dos arquivos alterados ficou limpo. A planilha usa o snapshot já gravado em `comissao_registro_itens` e a situação atual de `resumo_financeiro_pedidos`. Nenhum valor de comissão foi recalculado, o módulo financeiro não mudou e o banco não foi alterado. A tela autenticada não foi percorrida.

## O que mudou
A exportação passa a uma linha por produto: data da venda, vencimento vigente, consultor, cliente, produto, valor, margem individual, comissão em % e em R$, e Pago ou Não pago. Pago segue a tela: valor devido maior que zero e quitação integral. Valor zero quitado sai como Não pago. Pagamento parcial e estorno que reabre saldo ficam Não pago em todos os produtos. O valor calculado da comissão continua na linha. Os filtros e a permissão de gestor permanecem.

## Pendências
Registro sem itens de produto não entra no arquivo. A comissão do gestor João não foi implementada. A data da venda do Excel é `simulations.data_negociacao`; `data_venda` existe só na carga histórica.

## Próxima etapa
Entrar como gestor, exportar comissões e conferir um pedido com mais de um produto, um parcial e um quitado.

# Estado atual — 2026-11-19, aviso de vencimento no teste

## Verificado nesta revisão
As migrations do aviso foram aplicadas só no Syagri-Test (`uszbvqmquniuorxkqyat`). A função `notificacoes.avisar_vencimentos_financeiros` existe e o cron `financeiro_aviso_vencimento` está ativo, `0 11 * * *`. Nenhum pedido real vencia em 22/11/2026. Um pedido fictício, com consultor sem inscrição push, gerou um aviso interno e uma entrega push `skipped` / `no_subscription`. A segunda execução devolveu zero. Usuário, cliente, pedido, aviso e entrega de teste foram apagados. O banco oficial não foi alterado. Frontend e Edge Function não foram publicados.

## Pendências
Publicar o frontend e a função `enviar-push-notificacao` continua necessário para o clique do aviso abrir o pedido no site oficial. A migration ainda não entrou no Syagri oficial.

# Estado atual — 2026-11-19, aviso de vencimento

## Verificado nesta revisão
29 testes passaram em `vencimentoAvisos` e no destino do push. O lint desses arquivos ficou limpo. A rotina não foi aplicada no Syagri-Test nem no Syagri oficial. Nenhum recebimento, comissão ou classificador financeiro foi alterado. A tela autenticada não foi percorrida.

## O que mudou
O aviso de 3 dias reutiliza `public.notifications` e o gatilho de push já existente. A rotina `notificacoes.avisar_vencimentos_financeiros` escolhe pedido convertido, ativo, com saldo em aberto e consultor atual. A data é a de America/Sao_Paulo e o vencimento vigente, inclusive depois de renegociação. O registro `notificacoes.avisos_vencimento` guarda um envio por pedido e data. O cron previsto é `financeiro_aviso_vencimento`, às 11:00 UTC.

## Pendências
Aplicar as migrations `20261119123000` e `20261119123100` no Syagri-Test, com confirmação. Republicar o frontend e a função `enviar-push-notificacao` para o clique abrir o pedido. Sem isso, o aviso não entra no banco e o push publicado ainda não conhece o caminho novo. Não há variável nova.

## Próxima etapa
Confirmar a aplicação no Syagri-Test e, num pedido de teste que vença em 3 dias, chamar a função uma vez e de novo para ver um único aviso.

# Estado atual — 2026-11-19, refinamento da tela financeira

## Verificado nesta revisão
Testes de situação financeira e de acesso passaram no Vitest. A listagem usa um status só, com filtro local na mesma regra de 3 dias. O recebimento pede confirmação antes de gravar e trava o segundo clique. Banco, comissão e usuários financeiros não foram alterados. A tela autenticada não foi percorrida: o fluxo exige login.

## O que mudou
Busca e filtro alinhados. Valores total, recebido e saldo mais claros. Modal de recebimento menor, com pagamento total e data de hoje em America/Sao_Paulo. Renegociação mostra a data atual e a nova. O histórico permanece.

## Pendências
O classificador SQL ainda marca próximo em 7 dias. A tela ignora essa janela e calcula os 3 dias no navegador. As decisões de valor congelado, pedido convertido e comissão continuam abertas como em 18/11.

## Próxima etapa
Entrar como financeiro ou gestor e conferir a listagem, o pagamento total e a renegociação no Syagri-Test.

# Estado atual — 2026-11-18, módulo financeiro

## Verificado nesta revisão
13 testes de situação financeira e de acesso passaram. No Syagri-Test, `financeiro_classificar` devolveu pendente, parcial, quase quitado (saldo 0,01), quitado com comissão liberada, próximo, no prazo e pedido zerado sem liberar comissão. `registrar_recebimento` sem sessão respondeu "Não autenticado". O papel `anon` não lê nem grava as tabelas novas; `authenticated` só lê. Nenhum recebimento foi lançado em pedido existente. O banco Syagri oficial não foi alterado.

## O que mudou
Papel `financeiro`, carteira de recebimentos, estorno, renegociação de vencimento e consulta só leitura na lista e na tela do pedido. A comissão ganhou a coluna Liberação. O Excel de comissão não mudou.

## Pendências
Valor devido congelado no primeiro lançamento não acompanha mudança posterior do total do pedido. Recebimento só entra em pedido convertido e ativo. Próximo do vencimento são 7 dias. Pedido com valor zero fica quitado na cobrança e não libera comissão. Correção de valor é estorno mais novo recebimento. A tela autenticada não foi percorrida nesta sessão.

## Próxima etapa
Entrar como gestor no Syagri-Test, abrir Recebimentos e registrar um recebimento parcial num pedido convertido de teste. Só depois decidir a migration no Syagri oficial.

# Estado atual — 2026-11-17, planta da OC

## Verificado nesta revisão
O seletor de planta do pedido ao fornecedor lista só Uberaba (Minas Gerais), Cubatão (São Paulo) e Rio Grande (Rio Grande). Nome de filial comercial deixa de entrar nessa lista e deixa de sair na mensagem e no PDF como planta. Filial e filial de faturamento continuam no cabeçalho. Nenhuma compra antiga foi regravada.

## Próxima etapa
Conferir no site publicado se a planta da OC abre só Uberaba, Cubatão e Rio Grande.

# Estado atual — 2026-11-17, carga da base de vendas

## Verificado nesta revisão
A planilha `Aval_Base_Vendas_2026-11-09_1.xlsx` foi gravada em `dashboard_vendas_historicas`. No Syagri-Test, a carga de 7 de novembro saiu e ficaram 1.532 linhas, com o faturamento e o volume da aba Validacao. No Syagri oficial, a tabela estava vazia e recebeu as mesmas 1.532 linhas. Os 102 pedidos convertidos ativos do oficial continuam no lugar. Nenhum pedido, cliente ou produto foi apagado.

103 linhas da planilha repetem um pedido já convertido. A chave dessas linhas ficou igual à do pedido, então o painel mantém o pedido e não soma a planilha de novo. Metas e família/custo não foram gravados.

## Pendências
Parte dos pedidos convertidos não achou par com o mesmo cliente, produto, volume e valor. Esses ficam só como pedido do sistema. A meta da safra 26/27 ainda não cabe no ano calendário do cadastro.

## Próxima etapa
Abrir o painel do gestor no oficial e conferir se o total não repetiu os pedidos já lançados.

# Estado atual — 2026-11-17, leitura da base de vendas

## Verificado nesta revisão
A planilha `Aval_Base_Vendas_2026-11-09_1.xlsx` foi lida localmente. São 6 abas. A aba Pedidos tem 1.532 linhas, de abril de 2024 a 5 de novembro de 2026. Os totais da aba Validacao batem com a soma recalculada. Alíquota, semana, à vista e margem batem com a regra do painel, com folga de um centavo.

No Syagri-Test, as 705 linhas gravadas em 7 de novembro estão todas dentro desta planilha, com o mesmo faturamento e volume por chave. O arquivo novo acrescenta o restante. Nenhum insert foi feito. O banco oficial não foi consultado nesta leitura.

O importador atual procura a aba GFERT com os nomes longos. Esta planilha usa a aba Pedidos e nomes curtos, então o botão de carga recusaria o arquivo.

## Pendências
Confirmar se a carga entra só na tabela histórica do painel. A meta da safra 26/27 não cabe no ano calendário do cadastro sem uma decisão. Família/custo continua marcada para conferência antes de subir. Seis linhas idênticas repetidas entram na validação da planilha.

## Próxima etapa
Com o destino confirmado, montar a carga de teste no formato da tabela histórica, no lugar da importação parcial de 7 de novembro.

# Estado atual — 2026-11-17, visual de comissão e estoque

## Verificado nesta revisão
As telas de comissão e estoque tinham ajuste visual local, sem mudança de regra. Foram publicadas no GitHub Pages junto com o código já existente.

## Próxima etapa
Conferir no site o aviso push e o formulário de estoque.

# Estado atual — 2026-11-17, push nativo no oficial

## Verificado nesta revisão
O segredo `PUSH_DISPATCH_KEY` foi gravado na função oficial `enviar-push-notificacao` com o valor já existente no cofre. A função foi publicada de novo, com `verify_jwt` desligado. Às 06:26 UTC a resposta ainda era 403. Às 06:27 e 06:28 passou a 200. Sete envios ficaram `sent` e 33 foram pulados por não terem aparelho. Os 10 aparelhos que continuam inscritos — 5 iPhone/iPad, 3 Mac e 2 Android — aceitaram ao menos um aviso. Uma inscrição Android antiga saiu porque o navegador não a aceita mais.

As migrations locais que não constam no histórico do oficial já estavam aplicadas com outro número. As funções de venda do oficial e do teste têm o mesmo conteúdo. Nenhuma migration nova foi executada.

## Pendências
A fila antiga continua saindo, até 20 por minuto. Windows e Linux seguem sem inscrição.

## Próxima etapa
Conferir no aparelho os avisos que já saíram. Quem ainda não ativou só recebe o que for criado depois da ativação.

# Estado atual — 2026-11-16, publicação

## Verificado nesta revisão
66 testes dos arquivos de venda, painel, filial, preços e mensagem da OC passaram. A migration `20261111230000_simulacao_campos_venda_automaticos` foi aplicada no Syagri oficial (`dnmjjgeqaigrvdsflqrs`) e registrada no histórico. O gatilho antigo de lançamento saiu; ficaram `normalize_filial_codigo` e `trg_simulations_campos_venda`. O default de `status_lancamento` passou a `lancado`. As 264 simulações do oficial ficaram com data de negociação. Não houve carga da planilha GEFERT. Logística e push já existiam no oficial, com versões diferentes das do arquivo local; essas migrations antigas não foram reexecutadas.

## O que foi publicado
Pedido convertido ativo entra no painel sem compra e sem preço unitário. A planta da OC é Uberaba, Cubatão ou Rio Grande. Simulação nova grava data, filial, tipo reais e lançamento sem pedir esses campos. O site segue o push da `main` para https://aval-fertilizantes.online.

## Pendências
A tela publicada ainda não foi percorrida com sessão de gestor depois deste push. Histórico GEFERT continua fora do oficial.

## Próxima etapa
Conferir no site publicado a semana de novembro e uma OC com planta escolhida.

# Estado atual — 2026-11-12, pedido no painel e planta da OC

## Verificado nesta revisão
Os testes de fatos nativos, consulta do painel, mensagem da OC e preços passaram. O lint dos arquivos alterados nesta correção ficou limpo. O build do Vite concluiu. Cinco testes de planilha de fornecedor falharam porque os arquivos locais de `Planilhas de Fornecedores/` não estão na pasta; não fazem parte desta correção.

No Syagri-Test, uma simulação inserida como `converted` nasceu com data do dia em America/Sao_Paulo, filial do perfil, tipo `reais` e lançamento `lancado`. Um rascunho criado no mesmo bloco não entrou no predicado do painel. A transação foi desfeita: continuam 6 pedidos convertidos ativos e 705 linhas históricas. Nenhuma compra antiga teve a planta regravada. As 7 ordens de compra seguem com planta vazia e cidade Uberaba.

A auditoria foi só leitura. As 705 linhas estão ligadas ao arquivo importado, com data e valor. Há chaves de deduplicação repetidas dentro do mesmo arquivo; a regra atual mantém essas linhas. Nenhuma chave nativa coincidiu com o histórico. Nenhum dos 6 pedidos convertidos tem, ao mesmo tempo, preço unitário e vencimento na compra ligada.

## O que mudou no código
Pedido convertido ativo entra pelo item mesmo sem compra e mesmo com compra sem preço unitário. A linha não se repete por alocação. O painel aberto recarrega quando o cache é invalidado na conversão. A planta da OC é o seletor Uberaba, Cubatão ou Rio Grande. O seletor de filial comercial deixou de se chamar planta. PDF e mensagem usam a planta gravada.

## Pendências
Falta percorrer no navegador, com sessão de gestor, a semana de novembro no painel e o PDF depois de escolher a planta. O banco oficial e o site publicado não foram alterados.

## Próxima etapa
Conferir na tela o pedido de novembro e uma OC com planta Cubatão, Rio Grande ou Uberaba. Só então decidir publicação.

# Estado atual — 2026-11-11, correção da integração do dashboard

## Verificado nesta revisão
58 testes passaram nos arquivos de filial, data em America/Sao_Paulo, painel, fatos nativos, preços de compra e mensagem da OC. O lint dos arquivos alterados ficou limpo, salvo avisos antigos do simulador que não fazem parte desta correção.

No Syagri-Test, a migration `simulacao_campos_venda_regras` criou o gatilho `simulations_campos_venda` e o default `status_lancamento = lancado`. As 11 simulações existentes mantiveram tipo vazio e lançamento `nao_lancado`. A data nula foi preenchida com o dia de `created_at` em America/Sao_Paulo. A filial nula foi preenchida pelo perfil: 8 de consultores Uberaba e 3 de gestor, também Uberaba. Os códigos de perfil `UBERABA`, `NOVA PONTE`, `GUAÍRA`, `ITUVERAVA` e `FRUTAL` passaram para `uberaba`, `nova-ponte`, `guaira`, `ituverava` e `frutal`.

## O que mudou no código
O simulador não pede mais data, filial, tipo, safra nem lançamento. Esses campos só são gravados na criação. Um save posterior não os reenvia, e o gatilho devolve o valor antigo. Novas operações nascem em reais, lançadas, com a filial do consultor ou Uberaba para o gestor.

O painel continua só com pedido convertido e ativo. Total divergente permanece na base pela soma dos itens. Safra saiu dos filtros. O ano é o calendário de 01/01 a 31/12. A lista do que fica de fora está no painel.

Compra nova e lançamento individual pedem a cotação negociada e usam `calcOcItemValores`. A cotação do dia não preenche mais o cálculo. A planta do PDF é o valor gravado, entre Uberaba, Cubatão e Rio Grande. CTC pode ser inativado, sem apagar a compra. Comissão pagina de 50 em 50, busca o restante em páginas de 1000 e exporta XLSX só do que a sessão leu.

## Pendências
Fluxos de gestor e consultor na tela, criação, edição, aprovação e conversão não foram percorridos no navegador. Push de PWA não foi testado em aparelho iOS ou Android. O site oficial e o banco Syagri não foram alterados nem publicados. Histórico GEFERT não foi importado.

## Próxima etapa
Validar os fluxos na sessão de teste e só então decidir a publicação. A migration local é `supabase/migrations/20261111230000_simulacao_campos_venda_automaticos.sql`.

# Estado anterior — 2026-11-11, dashboard com pedidos oficiais

## Verificado nesta revisão
Os 34 testes do conjunto de vendas nativas, fatos e painel passaram (`nativeSalesFacts`, `salesDashboardService`, `salesDashboard`). Pedido sem compra entra pelo volume/valor; compra parcial mantém o restante; `created_at` cobre data ausente; total divergente isola a linha.

A conversão em pedido grava `data_negociacao` uma vez. O simulador não exige nem edita essa data. O painel abre sem ano pré-filtrado.

A migration `20261106193000_dashboard_vendas_gestor` foi aplicada no banco oficial Syagri (`dnmjjgeqaigrvdsflqrs`) e registrada no histórico. Sem backfill de pedidos e sem carga de planilha. Syagri-Test já tinha essa versão.

## O que a tela cobre
Gestor: visão geral, semana, fluxo de caixa, comparativo anual, consultores e margem. Pedidos convertidos ativos do banco oficial entram sem planilha. Cliente, consultor, produto, volume, faturamento e vencimento do cliente vêm do que já está gravado. Filial, tipo, safra, margem e caixa ficam “—” quando o campo falta.

## Pendências conhecidas
O frontend publicado ainda não inclui estas mudanças até um deploy explícito. Histórico GEFERT não foi importado em produção. Metas e família/custo seguem sem cadastro operacional. Pedidos antigos usam `created_at` até haver `data_negociacao` gravada na conversão.

## Próxima etapa
Validar o painel com sessão de gestor no ambiente que aponta para o banco oficial e publicar o frontend quando pedido.
