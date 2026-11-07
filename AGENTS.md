# Aval — orientação compartilhada

Leia docs/PROJECT_CONTEXT.md, docs/CURRENT_STATUS.md e docs/DECISIONS.md ao iniciar uma tarefa. Confira o estado real do Git antes de editar; os documentos são registros datados, não monitoramento automático.

Priorize a entrega do Aval e tarefas pequenas. Preserve alterações locais do usuário. Não altere regras de negócio, banco ou publicação em tarefas de integração/documentação.

Nunca leia ou copie credenciais sem necessidade específica. Não registre valores de .env, tokens, senhas, chaves privadas ou service-role. Não inclua dados pessoais/comerciais das referências em commits públicos. Evite git add .; selecione somente arquivos revisados.

Respeite as regras existentes em .cursor/rules/. A regra supabase-mcp.mdc restringe operações ao desenvolvimento e exige confirmação antes de migrations/operações destrutivas. Disponibilidade desse MCP em outro editor não comprova disponibilidade nesta sessão.

Ao concluir trabalho relevante, atualize CURRENT_STATUS.md com data, evidências, verificações, pendências e próximo passo. Registre decisões duráveis em DECISIONS.md; marque hipóteses como não verificadas.

Comandos declarados no package.json: npm run dev, npm run lint, npm run test, npm run build e npm run validate. Execute apenas os pertinentes à tarefa. Deploy e migrations são ações separadas.
