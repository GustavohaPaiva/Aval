# WhatsApp Cloud API — Aval

## Arquitetura

1. O sistema cria uma linha em `notifications`, como já faz hoje.
2. O trigger `notifications_enqueue_whatsapp` cria uma entrega em `whatsapp_outbox` quando o destinatário possui telefone e autorizou notificações.
3. A Edge Function `whatsapp-dispatch` reserva os itens de forma atômica e envia pela WhatsApp Cloud API.
4. O resultado e o ID retornado pela Meta ficam registrados. Falhas recebem até cinco tentativas com intervalo progressivo.

O token da Meta e a chave `service_role` nunca devem usar o prefixo `VITE_` nem ser enviados ao navegador.

## Secrets da Edge Function

```sh
npx supabase secrets set WHATSAPP_ACCESS_TOKEN=... --project-ref SEU_PROJECT_REF
npx supabase secrets set WHATSAPP_PHONE_NUMBER_ID=1195191270354479 --project-ref SEU_PROJECT_REF
npx supabase secrets set WHATSAPP_GRAPH_API_VERSION=vXX.X --project-ref SEU_PROJECT_REF
npx supabase secrets set WHATSAPP_DISPATCH_SECRET=UM_SEGREDO_FORTE --project-ref SEU_PROJECT_REF
```

Use a versão da Graph API atualmente indicada pela Meta em `WHATSAPP_GRAPH_API_VERSION`. O runtime do Supabase fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

## Implantação

```sh
npx supabase db push --project-ref SEU_PROJECT_REF
npx supabase functions deploy whatsapp-dispatch --no-verify-jwt --project-ref SEU_PROJECT_REF
```

Agende uma chamada periódica pelo backend:

```http
POST https://SEU_PROJECT_REF.supabase.co/functions/v1/whatsapp-dispatch
x-dispatch-secret: UM_SEGREDO_FORTE
content-type: application/json

{"batch_size":20}
```

## Habilitar um usuário de teste

```sql
update public.profiles
set whatsapp_phone_e164 = '+5534999999999',
    whatsapp_notifications_enabled = true
where id = 'UUID_DO_USUARIO';
```

## Janela de 24 horas

As notificações automáticas atuais são texto livre e só são entregues dentro de uma conversa iniciada pelo usuário nas últimas 24 horas. Fora dela, crie e aprove modelos na Meta e use `message_type = 'template'` com nome e idioma aprovados.

O modelo `hello_world` serve para validação técnica inicial e não substitui os modelos definitivos do Aval.

