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
