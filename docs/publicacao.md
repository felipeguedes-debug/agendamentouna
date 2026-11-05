# Publicação na Vercel com Supabase

O sistema nunca foi publicado. Este é o roteiro do primeiro deploy, com o que cada serviço pede e o que só dá para conferir em ambiente real. As decisões estão em `docs/decisoes.md`, da D-93 à D-104.

## O que precisa estar decidido antes

| O quê | Quem decide | Onde |
| --- | --- | --- |
| Texto definitivo de `/termos` e `/privacidade`, canal de contato e encarregado (DPO) | Jurídico | D-38, D-99 |
| Contratos de operador: WhatsAPI, SynkronosCRM, Vercel, Supabase, Inngest e Google | Jurídico | PRD 7 |

## Variáveis por serviço

Nunca copie um valor para o repositório, que é público (D-104), para um chamado ou para uma conversa. `.env*` fica fora do git.

**Prod** é o ambiente Production da Vercel e **Preview** é o de Preview. Os dois nunca dividem banco, chaves nem tokens.

### Supabase

| Variável | De onde vem | Prod | Preview |
| --- | --- | --- | --- |
| `DATABASE_URL` | Connect > Transaction pooler, porta 6543 | Sim | Outro projeto |
| `DIRECT_URL` | Connect > Session pooler, porta 5432, com `?sslmode=require` no fim | Sim | Outro projeto |
| `DATABASE_CA_CERT` | Database settings > SSL, conteúdo do certificado | Sim | Sim |
| `DATABASE_POOL_MAX` | Opcional, 5 por padrão | | |

### Vercel e aplicação

| Variável | De onde vem | Prod | Preview |
| --- | --- | --- | --- |
| `BETTER_AUTH_URL` | O domínio de produção, `https://...` | Sim | **Vazio:** vale o endereço do ramo (D-95) |
| `BETTER_AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | Próprio | Próprio |
| `TOKEN_ENCRYPTION_KEY` | O mesmo comando. **Trocar depois invalida todos os tokens guardados** | Próprio | Próprio |
| `PUBLIC_WEBHOOK_URL` | O mesmo domínio de produção | Sim | Vazio, salvo teste com provedor real |

### Google

| Variável | De onde vem | Prod | Preview |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Cloud Console > Credenciais | Sim | Vazio, ou cliente de teste |
| `GOOGLE_CALENDAR_PROVIDER` | Produção ignora | | `sandbox` |
| `GOOGLE_ALLOWED_ACCOUNTS` | Contas de teste, se ligar o real | | Só de teste |

### WhatsApp

| Variável | Prod | Preview |
| --- | --- | --- |
| `MESSAGING_PROVIDER` | Produção ignora | `sandbox` |
| `MESSAGING_ALLOWED_NUMBERS` | | Só números de teste, nunca o de um profissional |

URL, token e número de cada instância entram na tela do profissional (D-94). `WHATSAPI_API_URL` e `WHATSAPI_TOKEN` são só de desenvolvimento.

### SynkronosCRM

| Variável | Prod | Preview |
| --- | --- | --- |
| `FLWCHAT_API_URL` | `https://api.wts.chat` | O mesmo |
| `CRM_PROVIDER` | Produção ignora | `sandbox` |
| `CRM_ALLOWED_CONTACTS` | | Só contatos de teste, nunca um paciente |

O token entra na tela Segurança e integrações (D-68).

### Web Push

| Variável | De onde vem | Prod | Preview |
| --- | --- | --- | --- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys`. **Trocar depois desliga os avisos de todos os aparelhos** | Próprias | Próprias, ou vazio |
| `VAPID_SUBJECT` | `mailto:` de quem responde pelo sistema | Sim | Sim |
| `PUSH_PROVIDER`, `PUSH_ALLOWED_USERS` | Produção ignora | | `sandbox` |

### E-mail

| Variável | De onde vem | Prod | Preview |
| --- | --- | --- | --- |
| `EMAIL_PROVIDER` | `gmail` | Sim | Vazio: sai no log |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Conta Google > Senhas de app (D-90) | Sim | |
| `EMAIL_FROM_NAME` | Opcional | | |
| `EMAIL_ALLOWED_RECIPIENTS` | Opcional em produção | | Obrigatório se ligar o Gmail |

### Inngest

| Variável | De onde vem | Prod | Preview |
| --- | --- | --- | --- |
| `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` | A integração com a Vercel define | Sim | Da integração |
| `INNGEST_SERVE_ORIGIN` | O domínio de produção, se for próprio | Sim | |
| `INNGEST_DEV` | **Nunca em produção** | Não | Não |

A Vercel define sozinha `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL` e `VERCEL_PROJECT_PRODUCTION_URL`, com "Automatically expose System Environment Variables" ligado, o padrão. O sistema depende de `VERCEL_ENV` para saber que um preview não é produção.

## Ordem do primeiro deploy

1. **Supabase, produção.** Crie o projeto na região `sa-east-1`, no plano Pro, que guarda os backups diários por 7 dias, o combinado para o piloto (D-103). O gratuito não tem backup diário. Guarde a senha do banco.
2. **Feche a Data API.** Integrations > Data API > Overview, desligue **Enable Data API**. Sem RLS (D-02), ela daria acesso às tabelas. A migração também tira as permissões, como segunda barreira (D-97).
3. **Exija TLS.** Database settings > SSL Configuration, ligue **Enforce SSL** e baixe o certificado.
4. **Supabase, preview.** Crie um segundo projeto, sem dado real, com os passos 2 e 3.
5. **Segredos.** Gere os de cada ambiente, com os comandos das tabelas.
6. **Google Cloud.** Ative a Google Calendar API. Crie o cliente OAuth com os redirects `<domínio>/api/auth/callback/google` e `<domínio>/api/google/oauth/callback`. Publique em produção, nunca em Testing (D-24, D-65).
7. **Gmail.** Crie a senha de app e, em Workspace, confira se o administrador permite (D-90). Confira com `npm run email:teste`.
8. **Vercel.** Importe o repositório do GitHub. Use um plano que permita uso comercial. Região e Node vêm de `vercel.json` e `package.json`. Preencha as variáveis por ambiente. Deixe a Deployment Protection em **Standard Protection**: ela protege previews e deixa os webhooks chegarem ao domínio de produção.
9. **Inngest.** Comece no plano gratuito (D-100). **Passe para o Pro antes do piloto:** ao chegar aos 50 mil por mês, a execução pausa e só volta com o upgrade, e a régua para sem aviso no sistema. Instale a integração com a Vercel, que define as chaves e sincroniza a cada deploy. Para os previews receberem jobs, crie o "Protection Bypass for Automation" e informe em "Deployment protection key".
10. **Domínio.** Aponte o domínio de produção antes do deploy: `BETTER_AUTH_URL`, `PUBLIC_WEBHOOK_URL`, os redirects do Google e `INNGEST_SERVE_ORIGIN` dependem dele.
11. **Deploy.** Um push na `main` roda `next build` e, se passar, `npm run db:deploy`. O log tem de mostrar as migrações aplicadas.
12. **Primeira conta (D-93).** Da sua máquina, com as variáveis de produção num arquivo fora do git:

    ```bash
    npx vercel env pull .env.producao --environment=production
    ```

    ```bash
    npx tsx --env-file=.env.producao scripts/create-account.ts --organizacao "Nome" --conta "Consultório" --unidade "Unidade" --endereco "Endereço" --email admin@exemplo.com
    ```

    O comando mostra o host do banco antes de agir. Apague `.env.producao` ao terminar. Se o convite vencer em 7 dias, use `--reconvidar`.
13. **Primeiro acesso.** O admin aceita o convite e ativa o 2FA em Segurança. Depois cadastra tipos, profissionais e usuários.
14. **WhatsApp.** Comece por um número de teste. Conecte no painel da WhatsAPI pelo QR Code, registre na tela do profissional e confira o webhook com uma resposta "1". Só depois os números reais. O WhatsApp permite quatro aparelhos conectados, e cada número usa dois (D-05).
15. **Google, verificação.** Com o site no ar, informe a página inicial e `/privacidade` na tela de consentimento e peça a verificação (D-24). A verificação vai pedir um contato, que ainda não existe (D-99).
16. **Monitor.** Aponte um monitor externo para `/api/health`.

## O que conferir na primeira publicação

Nada disto dá para testar sem ambiente real. Se um item falhar, pare antes dos números reais.

| O quê | Como | O que esperar |
| --- | --- | --- |
| Transaction pooler | Entre, marque, confirme e remarque, inclusive dois agendamentos ao mesmo tempo no mesmo horário | Sem erro de prepared statement, e só um dos dois grava (D-43) |
| Certificado do banco | `/api/health` | 200. Se o log disser `SELF_SIGNED_CERT` ou erro de hostname, confira o certificado; como saída provisória e explícita, `?sslmode=no-verify` em `DATABASE_URL`, sem `DATABASE_CA_CERT` |
| Migração no build | Log do deploy e `_prisma_migrations` | Todas aplicadas. Sem espera no advisory lock |
| Data API fechada | `curl https://<ref>.supabase.co/rest/v1/Patient -H "apikey: <chave pública>"` | Recusa, nunca uma lista |
| Limite de login | 4 senhas erradas em 10 s, e `select key from "RateLimit"` | A 4ª dá "Muitas tentativas". A chave traz um endereço, e nunca `no-trusted-ip`, que seria um balde dividido por todos (D-96) |
| Status HTTP | Tela sem permissão, conta sem acesso e `/` com sessão | 403, 404 e 307 (D-72; `e2e/status.spec.ts` mostra os casos) |
| Cabeçalhos | `curl -I` em `/login` e `/` | Os de `e2e/publicas.spec.ts` |
| Página sem sessão | `/` numa janela anônima | 200, com a página inicial e sem redirecionar |
| Preview | Num preview, marque um agendamento com paciente fictício | A mensagem fica no sandbox, nenhuma sai |
| Login no preview | Entre pelo endereço do ramo e pelo do deploy | Os dois aceitam (D-95) |
| Inngest | Painel do Inngest | 13 funções sincronizadas, `minute-tick` a cada minuto e a contagem batendo com a D-100: cerca de 1.443 execuções por dia com o sistema parado. Enquanto estiver no plano gratuito, confira o uso toda semana |
| Webhooks | Resposta "1" no número de teste, evento no Google, etiqueta na Synkronos | Mudam a agenda, como nas D-57, D-65 e D-70 |
| Tamanho da função | Log do deploy | Abaixo do limite de 250 MB da Vercel. Medida local na D-97 |
| Web Push | Instale a PWA, com push real | Aviso chega, sem nome de paciente (D-78, D-79) |
| Erro no painel | Tela `/saude` depois de um erro real | Aparece a rota e o tipo, sem o texto |
| Backup | Database > Backups, no dia seguinte ao deploy | Um backup por dia, até 7 (D-103) |
| Restauração | Depois das primeiras contas, e de novo a cada trimestre: Database > Backups > **Restore to a New Project**, nunca o restore no próprio projeto, que o deixa fora do ar. Compare as contagens de `Patient` e `Appointment` | As mesmas de quando o backup foi feito. Nenhum serviço aponta para o projeto novo, e ele traz dados reais: apague ao terminar |

## O que não foi testado

Sem ambiente real, ficaram de fora:

- **Transaction pooler de verdade.** Confere-se no código que o adaptador não usa prepared statement nomeado. Nenhuma consulta passou por um pooler.
- **Certificado do Supabase.** A montagem das opções é testada pelo próprio `pg`, mas nenhuma conexão com TLS foi aberta.
- **Um projeto Supabase hospedado.** As migrações rodaram na imagem oficial do Postgres do Supabase (17.11.0.004), num contêiner descartável, com o usuário `postgres`, que lá não é superusuário. Passaram as 49 tabelas, os triggers e o `unaccent`, e nenhuma tabela ficou acessível para `anon`, `authenticated` ou `service_role` (D-97). A Data API em si, o `anon` chamando pela rede, não foi testada.
- **Deploy na Vercel:** `vercel.json`, build, região, `VERCEL_ENV`, Deployment Protection, `x-forwarded-for` e status HTTP (D-72).
- **Inngest Cloud.** O tick e as funções sem passo só rodaram pelas funções, sem o Inngest. A cobrança de um run sem passos é leitura da fórmula da página de preços.
- **Tela da instância com a WhatsAPI real.** Rodou com o provedor simulado; o cliente é o mesmo da D-57.
- **Ida real ao Google com a CSP.** Só o sandbox.
- **E-mail de convite real pelo comando.** Só o terminal.
- **Backup e restauração.** Nenhum backup do Supabase existe nem foi restaurado ainda. O primeiro teste é o da tabela acima (D-103).
