# Agenda de consultórios

Agenda multiusuário para consultórios particulares: tipos de atendimento com valor, Google Agenda de mão dupla e régua de lembretes por WhatsApp.

@AGENTS.md

## Antes de qualquer tarefa

- Leia `docs/PRD.md` (o produto) e `docs/decisoes.md` (D-01 em diante). Decisão nova tomada no meio do trabalho entra no fim de `docs/decisoes.md`, com o próximo número, e o PRD é atualizado onde ela se aplica.
- A construção segue os blocos da seção 12 do PRD: um bloco por sessão, teste escrito antes da implementação, `npm run check` passando e commit no fim.
- Mockups das telas: https://claude.ai/artifact/5NFzJMmuTRwhMB5VPeEfmT (PNGs em `docs/mockups/` quando exportados).

## Stack

Next.js 16 (App Router, TypeScript) · PostgreSQL 17 · Prisma 7 com `@prisma/adapter-pg` · Tailwind 4 · Vitest · Better Auth 1.7.14, fixado (D-35) · shadcn/ui (Radix) · Playwright (D-46) · Inngest 4.26.1, fixado (D-54) · googleapis 186.0.0, fixado, importado só pelo módulo do Calendar (D-58) · API do FlwChat com fetch próprio, mapeada em `docs/flwchat.md` (D-66) · web-push 3.6.7, fixado, carregado só pelo provedor real (D-78) · nodemailer 10.1.7, fixado, carregado só pelo provedor de e-mail (D-90).

O client do Prisma é gerado em `src/generated/prisma` (fora do git; `npm install` e `npm run db:generate` geram). Importe de `@/generated/prisma/client`. Configuração do Prisma em `prisma.config.ts`; o `.env` não é lido automaticamente pelo Prisma 7, por isso o `import "dotenv/config"`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run db:up` | Sobe o Postgres do `docker-compose.yml` (bancos `agenda` e `agenda_test`) |
| `npm run db:migrate` | Cria e aplica migração a partir do `schema.prisma` |
| `npm run db:seed` | Popula a demo dos mockups (`prisma/seed-demo.ts`); não faz nada se já populado |
| `npm run db:reset` | Apaga o banco de desenvolvimento, reaplica as migrações e roda o seed |
| `npm test` | Recria `agenda_test` a partir das migrações e roda o Vitest |
| `npm run check` | `prisma validate`, lint, tipos (depois do `next typegen`) e testes. Rodar antes de todo commit |
| `npm run test:e2e` | Playwright: build de produção na porta 3100 contra o `agenda_test` recriado. Fora do `check`; não rodar junto com `npm test` (D-46) |
| `npm run bench:search` | Mede a busca de paciente com 50 mil cadastros por conta no `agenda_test` recriado (D-50). Também não roda junto com `npm test` nem com o e2e |
| `npm run inngest:dev` | Servidor local do Inngest (sem conta), que roda a fila da régua contra o `npm run dev` (D-54) |
| `npm run whatsapi:setup -- --profissional "Nome"` | Registra a instância de teste da WhatsAPI (`.env`) para um profissional do banco de desenvolvimento e aponta o webhook para `PUBLIC_WEBHOOK_URL` (D-51) |
| `npm run whatsapi:reply -- --celular "85 9..." --texto 1` | Simula a resposta de um paciente no webhook local |
| `npm run google:sandbox -- <comando>` | Faz o papel do profissional no Google falso (D-58): `evento`, `mover`, `apagar` e `listar`; `sincronizar [--email conta]` exporta e lê o Google na hora, sem o Inngest |
| `npm run crm:sandbox -- <comando>` | Faz o papel da secretária no CRM falso (D-66): `etiqueta --celular ... --etiqueta "Confirmar na agenda"` aplica e posta o webhook (`--sem-webhook` simula um perdido) e `listar` mostra etiquetas e notas; `sincronizar` e `reconciliar` fazem na hora o que o Inngest faz |
| `npm run push:sandbox -- <comando>` | Web Push sem Inngest e sem celular (D-78): `enviar` faz na hora o que o tick faz, `listar [--endpoint url]` mostra o que o provedor falso entregou e `assinaturas --email x` conta os aparelhos da pessoa |
| `npm run email:teste -- --para voce@exemplo.com` | Manda uma mensagem de teste pelo provedor do `.env` (D-90). Fora de produção, o destinatário precisa estar em `EMAIL_ALLOWED_RECIPIENTS` |
| `npm run conta:criar -- --organizacao "X" --conta "Y" --unidade "Z" --endereco "..." --email a@b.com` | A primeira conta de um banco vazio, com o convite do primeiro admin (D-93). `--acrescentar` põe outra conta numa organização, e `--reconvidar` troca um convite vencido |
| `npm run operador:saude -- --dias 7` | A saúde da operação em todas as organizações (D-101) |
| `npm run db:deploy` | Aplica as migrações por `DIRECT_URL` e recusa o transaction pooler (D-97). Roda no build da Vercel, depois do `next build` |
| `npm run flwchat:setup -- --conta "Nome"` | Conecta uma conta do banco de desenvolvimento à conta de teste do FlwChat, com `FLWCHAT_TOKEN` do `.env` (exige `CRM_PROVIDER="flwchat"`; D-70) |

Login da demo: os e-mails do seed com a senha `DEMO_PASSWORD` de `prisma/seed-demo.ts`. `db:seed`, `db:reset` e `db:migrate` só rodam num banco desta máquina (D-98). Convite em desenvolvimento: o link sai no terminal do `npm run dev`.

## Sessão na nuvem (D-105)

- O ambiente da nuvem é o `agendamentouna`. O Setup script dele instala o Node do `.nvmrc` com links em `~/.local/bin`, porque a imagem traz o Node 22 no `PATH` e o shell da sessão não carrega o nvm. Depois roda `npm ci` e copia o `.env` do exemplo, sem valores. Ele não deixa processo rodando.
- **O Docker e o Postgres sobem na sessão:** se `docker info` falhar, rode `bash scripts/cloud-setup.sh` antes de qualquer teste (menos de 1 min). Ele refaz o que o Setup script faz, sobe o `dockerd` à mão, porque não há systemd, e roda `npm run db:up`. Pode rodar de novo sem estragar nada. Sessão que volta do ócio reinicia o contêiner: os arquivos ficam, mas os processos não, e o Docker cai de novo.

## Produção (D-93 a D-104)

- Roteiro do primeiro deploy, variáveis por serviço e o que ainda não foi testado: `docs/publicacao.md`.
- **Produção é `isProduction()`, de `src/lib/env.ts`, nunca `NODE_ENV`:** a Vercel põe `NODE_ENV=production` no preview, que se comporta como fora de produção (D-95). `NODE_ENV` decide só o que é do build, como cookie seguro. Endereço do app por `appBaseUrl()`.
- **`DATABASE_URL` é o transaction pooler; `DIRECT_URL`, o das migrações** (`src/lib/db/connection.ts`, D-97). Sem prepared statement nomeado, sem estado de sessão e sem `LISTEN`: no pooler, cada transação pode cair em outra conexão. Banco remoto só com TLS.
- **Migração tem de ser compatível com a versão no ar:** o build migra antes de o deploy novo assumir. Migração nova que cria tabela não precisa de `REVOKE`: a `close_supabase_data_api` já mudou as permissões padrão (D-97).
- **Evento ao Inngest conta execução** (D-100). Trabalho por agenda entra em `src/lib/inngest/tick.ts`, não em cron novo. Função com um trabalho só não tem `step`. O teste soma os crons. De dentro de um job, envie por `sendFromJob`.
- **Erro guarda onde e de que tipo, nunca a mensagem** (`src/lib/observability`, D-101). Tela nova de saúde lê por `loadPracticeHealth`.
- **CSP com nonce em `src/proxy.ts`, e toda página é dinâmica** (`connection()` no layout raiz, D-102). Sem `<script>` inline nem `<Script>` sem nonce, e sem recurso de outro domínio sem mudar `src/lib/security/headers.ts`. `e2e/publicas.spec.ts` confere.
- Primeira conta só por `src/lib/operator/first-account.ts` (D-93). Instância de WhatsApp só por `saveWhatsappInstance` (`src/lib/cadence/instance-setup.ts`, D-94): o token nunca volta para a tela.
- **O repositório é público (D-104).** Nenhum dado real em arquivo, teste, commit ou mensagem de commit: número, e-mail, nome de cliente, servidor, tamanho de conta. Teste real registra o que mediu, não de quem. Branch nova sai da `main`: as antigas (`bloco-*`, `claude/*`, `ux/*`, `historico-privado`) têm o histórico anterior, que nunca vai para o remoto, e o `pre-push` local as recusa.

## Autenticação e permissões (D-35 a D-40)

- Toda página e Server Action de conta começa com `requirePracticePermission(practiceId, "<permissão>")` (ou `requirePracticeAccess` quando todo papel entra), de `src/lib/auth/guard`, e usa o `db` que ele devolve. Sem acesso à conta dá 404; sem permissão, 403.
- Permissões em `src/lib/auth/permissions.ts`, espelhando a tabela da seção 3 do PRD (o teste confere linha a linha). Tela nova de conta entra em `src/app/(app)/conta/sections.ts`, com a permissão que a página checa e o lugar no menu: lateral, grupo de Configurações ou menu do usuário (D-81).
- `src/proxy.ts` só olha se há cookie de sessão. Não ponha regra de papel nem consulta ao banco nele.
- Login, Google, 2FA, senha esquecida (D-88) e saída vão pelo `authClient` (`src/lib/auth/client.ts`), no navegador, para passar pelo limite de tentativas do `/api/auth`. Não chame `auth.api` de Server Action para isso.
- Telas autenticadas ficam em `src/app/(app)` e bloqueiam no servidor, e o redirecionamento, o 404 e o 403 saem com o status certo (`e2e/status.spec.ts`). Por isso `cacheComponents` fica desligado e não há `<Suspense>` nem `loading.tsx` acima da checagem: com a resposta já saindo, o status fica em 200 (D-72).
- Usuário só nasce por convite (`src/lib/users/invitations.ts`). E-mail sai por `EmailSender` (`src/lib/email`): no terminal em desenvolvimento, em memória ou no terminal nos testes, e pelo Gmail com `EMAIL_PROVIDER="gmail"`, que fora de produção só alcança `EMAIL_ALLOWED_RECIPIENTS` (D-90).
- `Practice.requireTwoFactor` só muda por `setTwoFactorRequired` (`src/lib/auth/two-factor-requirement.ts`), com auditoria. Quem alcança a conta e não ativou vai para `/seguranca` em toda página, em todas as contas, inclusive quem ligou (D-36, D-71).
- Teste de página: `vi.mock("next/headers")` e `setRequestCookie(await signIn(email))`, de `tests/helpers/auth.ts`.

## Agenda (D-41 a D-46)

- Status de agendamento só muda por `changeAppointmentStatus` ou `rescheduleAppointment` (`src/lib/appointments/appointments.ts`), que aplicam a tabela de `status.ts` e gravam histórico e auditoria. Nunca atualize `Appointment.status` direto; a resposta do paciente usa `changeAppointmentStatus` com um `CadenceActor` (ator `cadence`, origem `CADENCE_REPLY`), e a importação usa `changeAppointmentStatus` com `source: "IMPORT"` dentro da transação de `importAppointment` (D-48).
- Agendamento novo e remarcação checam conflito numa transação serializável; encaixe é `appointments:overbook`.
- Datas de exibição e entrada pelos helpers de `src/lib/dates/zoned.ts` (fuso da unidade de cada agendamento; o da agenda é o da primeira unidade ativa). Dinheiro por `src/lib/domain/money.ts`.
- `Patient.searchName` é mantido por trigger do banco (`unaccent`); não grave nele. Celular de paciente em E.164 por `normalizePhone`.
- Telas novas usam os componentes de `src/components/ui` (shadcn) e `NativeSelect`; `src/components/app-ui.tsx` é o legado do Bloco 2. Componentes de uma tela ficam em pasta privada (`_agenda`).
- Teste de fluxo no Playwright em `e2e/`, com dados fixos de `e2e/data.ts` (secretária e gestora).
- O que abre sobre uma tela é um painel com estado na URL (`UrlPanel`, `src/components/url-panel.tsx`), renderizado pela página depois das checagens, para o 404 sair com o status certo (D-72, D-83). Parâmetros da agenda em `src/lib/agenda/params.ts`.
- Bloqueio manual só por `createTimeBlock`, `updateTimeBlock` e `removeTimeBlock` (`src/lib/agenda/time-blocks.ts`). Leitura de bloqueio filtra `deletedAt: null`: removido com evento no Google fica até a exportação apagar (D-85).
- O que espera alguém entra em `src/lib/pending`, que alimenta a tela Pendências e o contador do menu (D-84).
- Cadastro de profissional e ligação com as unidades só por `src/lib/professionals/professionals.ts` (D-91). Evento ao Inngest só por `sendWithoutWaiting` (`src/lib/inngest/client.ts`): nenhuma tela espera o Inngest, e o teste varre o código (D-92).
- Unidades, horários e exceções só por `src/lib/locations/locations.ts` (D-86). Ação nova de auditoria precisa de rótulo em `src/lib/audit/labels.ts`; o teste varre o código (D-87).

## Pacientes e importação (D-47 a D-50)

- Consentimento de contato só por `recordConsent` (`src/lib/patients/consent.ts`) ou no cadastro (`createPatientQuick` com `consentChannel`). `ContactConsent` é só de inserção (trigger e `APPEND_ONLY_MODELS`): revogar é gravar linha nova com `granted: false`. O estado é a linha mais recente (`latestConsents`); só "granted" entra na régua. Tipos e canais que a tela usa ficam em `src/lib/domain/consent.ts`, sem dependência do banco.
- Importação em `src/lib/imports`: `readSheet` lê e valida o arquivo, `importPatients` deduplica pelo celular normalizado, `importAgenda` cria cada linha por `importAppointment` (régua desligada, origem `IMPORT`). Linha com problema vai para o relatório (`ImportReport`), que não é guardado. Modelos em `public/modelos`; mudou coluna, mude `templates.ts` e o modelo juntos (o teste confere).
- Exportação e exclusão do titular só por `exportPatientData` e `erasePatient` (`src/lib/patients/data-requests.ts`). Paciente nunca é apagado; anonimizado tem `anonymizedAt` e some das buscas. Campo novo com dado pessoal ou texto livre ligado ao paciente precisa entrar na exclusão e na exportação.

## Régua de WhatsApp (D-51 a D-56)

- Regras em `src/lib/cadence`: `schedule.ts` (quando cada passo sai: janela, margem, 4 h; puro), `plan.ts` (disparos de cada agendamento, parada por status, versões e replanejamento), `sender.ts` (envio de um disparo por vez), `replies.ts` e `webhook.ts` (respostas e eventos da WhatsAPI), `editor.ts` e `worklist.ts` (telas). O Inngest (`src/lib/inngest`) só chama essas funções; teste as regras sem ele.
- Disparos nascem por `planAppointmentCadence`/`planCadences` na transação de quem cria o agendamento, e mudança de status já aplica `applyStatusChangeToCadence` dentro de `changeAppointmentStatus`. Não crie nem cancele `Dispatch` por fora; mudança de régua, tipo ou janela passa por `replanAppointments` (mantém as próximas 24 h). Consentimento mudou, `applyConsentToCadence` na mesma transação.
- Mensagens só por `providerFor(instance)` de `src/lib/messaging` (`MessagingProvider`), e a instância só nasce por `saveWhatsappInstance` (D-94). Fora de produção o padrão é o sandbox (tabela `SandboxMessage`); o envio real exige `MESSAGING_PROVIDER="whatsapi"` e só alcança `MESSAGING_ALLOWED_NUMBERS`. Nunca use o número de um profissional para teste.
- Token de instância só criptografado (`encryptSecret` de `src/lib/crypto/secrets.ts`). O webhook `/api/webhooks/whatsapi/[instanceId]` confere o token do corpo antes de tudo e trata o evento na hora.
- `Dispatch.statusReason` guarda códigos (`DispatchReason` em `plan.ts`), com o texto em `DISPATCH_REASON_LABELS`; motivo novo entra nos dois.

## Google Agenda (D-58 a D-65)

- Regras em `src/lib/google`: `rules.ts` (puro: título do evento, calendários ocupados, evento vira bloqueio), `link.ts` (vínculo OAuth), `connection.ts` (tokens, lista de calendários, secundário, desvincular), `queue.ts` (marcar e notificar, sem carregar o Google), `outbound.ts` (exportação), `inbound.ts` (leitura: bloqueios e pendências), `changes.ts` (aceitar e reverter), `profile.ts` e `jobs.ts` (telas e Inngest). O Inngest só chama essas funções; teste as regras sem ele.
- Google só por `googleProvider()` ou `googleProviderFor(subject)` de `src/lib/google` (`GoogleCalendarProvider`). Fora de produção o padrão é o sandbox (tabelas `SandboxGoogle*`); o Google real exige `GOOGLE_CALENDAR_PROVIDER="google"` e só vincula as contas de `GOOGLE_ALLOWED_ACCOUNTS`, e um vínculo do sandbox continua no sandbox. Nunca use a agenda de um profissional para teste. O que o projeto do Google Cloud precisa está na D-65.
- Tokens do Google só criptografados (`encryptSecret`). Escopos em `CALENDAR_SCOPES` (`provider.ts`): nada de escopo amplo.
- Mudança em agendamento que o Google precisa ver marca `googleSyncRequestedAt` com `markForGoogleSync` na mesma transação e chama `requestGoogleSync` depois do commit. `createAppointment`, `rescheduleAppointment`, `changeAppointmentStatus` (sem `tx`), `importAgenda` e `erasePatient` já fazem isso. Nunca escreva em `googleEventId` nem no Google por fora da exportação.
- Mudança feita no Google vira `PendingGoogleChange`, resolvida só por `resolveGoogleChange` (origem GOOGLE, ator `google` do `checkTransition`). Toda mudança de status já fecha as pendências do agendamento (SUPERSEDED).
- O secundário da própria conta nunca vira bloqueio; bloqueio do Google não copia conteúdo do evento. Nome de calendário pessoal só aparece para o próprio profissional.
- `GoogleConnection`, `GoogleCalendar` e `SandboxGoogle*` cruzam contas: leia pelo cliente base em `src/lib/google`, com comentário; o que é da conta (bloqueio, pendência, secundário, pedido de vínculo) vai pelo cliente com escopo.
- Teste com o Google falso: `linkGoogle` de `tests/helpers/google.ts` e os helpers de `sandbox.ts` (`putSandboxEvent`, `moveSandboxEvent`, `deleteSandboxEvent`); `failingProvider` simula erro do Google. Espione `inngest.send` nos testes que vinculam Google.


## SynkronosCRM (D-66 a D-70, D-73)

- Regras em `src/lib/crm`: `rules.ts` (puro: etiquetas, notas, leitura do webhook), `queue.ts` (marcar e notificar, sem carregar o cliente), `account.ts` (a conta que cruza consultórios), `connection.ts` (token e webhook), `outbound.ts` (exportação), `inbound.ts` (comandos da secretária), `webhook.ts`, `reconcile.ts`, `settings.ts` e `jobs.ts` (tela e Inngest). O Inngest só chama essas funções; teste as regras sem ele. A API está mapeada em `docs/flwchat.md`.
- Uma conta da Synkronos pode atender vários consultórios (D-73). `CrmAccount` (token, webhook, situação) cruza contas: leia só por `account.ts`, com comentário; `CrmConnection` é o vínculo de cada consultório. Nada de um consultório aparece para outro, salvo a etiqueta de status, que é do contato.
- CRM só por `crmProviderFor(account)` de `src/lib/crm` (`CrmSync`). Fora de produção o padrão é o sandbox (tabelas `SandboxCrm*`); o FlwChat real exige `CRM_PROVIDER="flwchat"` e só alcança `CRM_ALLOWED_CONTACTS`, e um token `sandbox-...` continua no sandbox. Nunca use um paciente nem o número de um profissional para teste.
- Token só criptografado (`encryptSecret`), em `CrmAccount`; o segredo do webhook só em SHA-256. A tela nunca devolve o token.
- A secretária age por **etiqueta de comando** no contato ("Confirmar na agenda", "Contato manual na agenda"), porque o FlwChat não tem evento próprio para isso (D-66). O agendamento é o da D-08, entre os consultórios da conta. Etiqueta de status ("Agenda: Confirmado") é saída: nunca faça o sistema agir por ela. A API devolve nomes em maiúsculas: compare só com `sameTag`, e não dê a um comando nome parecido com o de um status (D-70).
- O corpo do webhook não vale nada: `applyContactCommands` relê o contato na API antes de agir (D-67). Mensagem do paciente nunca entra por esse webhook (D-05), e a assinatura é só de `CONTACT_TAG_UPDATE`. Ela cobre a conta inteira, com dados de contatos de outros consultórios no corpo: nunca grave nem registre o corpo. Etiqueta aplicada pela API não gera evento, só a da tela (D-70).
- Mudança que o CRM precisa ver marca `crmSyncRequestedAt` com `markForCrmSync` ou `markPatientsForCrmSync` na mesma transação e chama `requestCrmSync` depois do commit. `createAppointment`, `rescheduleAppointment`, `changeAppointmentStatus` (sem `tx`), `createPatientQuick`, `updatePatientPhone`, as importações e `erasePatient` já fazem isso. Falha no CRM nunca pode impedir a agenda.
- Status vindo do CRM só por `changeAppointmentStatus` com um `CrmActor` (ator `crm`, origem `CRM`), e o `checkTransition` só deixa de Agendado para Confirmado.
- Nota na conversa leva o nome exibido do tipo (D-14), nunca o nome do paciente, o celular ou a observação interna, e só vai para a conversa com o número do profissional do agendamento: a mais recente pode ser de outro consultório (D-73). Contato existente nunca é renomeado. A exclusão do titular apaga notas e etiquetas lá; contato e conversas o gestor exclui na Synkronos, porque a API não apaga (D-68). Dado novo ligado ao paciente entra em `erasePatient` e `exportPatientData`.
- Teste com o CRM falso: `connectCrm`, `crmContactOf`, `crmStateOf` e `failingCrm` de `tests/helpers/crm.ts`, e os helpers de `sandbox.ts` (`putSandboxContact`, `applySandboxTag`, `sandboxWebhookBody`). Espione `inngest.send` nos testes com conta conectada.

## PWA do profissional (D-76 a D-78)

- Telas em `src/app/(app)/pwa`: `/pwa` é o `start_url` e `/pwa/[id]` é o dia, sempre a agenda da própria pessoa (`loadProfessionalDay`, de `src/lib/pwa/today.ts`). Regra de agenda, status e pendência continua nos módulos deles.
- **`public/sw.js` não guarda tela nem resposta.** Só `offline.html` e um ícone, e só navegações passam por ele. Nada de `cache.put`, de cachear `/_next` ou de agenda offline sem nova decisão (PRD 7, D-76). Mudou o que ele guarda, mude `CACHE` para o navegador limpar o antigo; `src/lib/pwa/service-worker.test.ts` e `e2e/pwa.spec.ts` conferem.
- Sem conexão a agenda sai da tela (`ConnectionGate`). A checagem dele usa `disableRefresh`: consultar não renova a sessão (D-37).
- Sessão de 30 dias só por `POST /api/auth/remember-device` (`src/lib/auth/remembered-device.ts`), a pedido e só de quem atende (`listProfessionalAccess`). Não pula o 2FA. Saída recarrega a página inteira.
- Web Push em `src/lib/push`: `rules.ts` (o texto, puro), `queue.ts` (marcar e notificar), `notify.ts` (envio), `subscriptions.ts` (por sessão, criptografada). Só por `pushProvider()`. Fora de produção o padrão é o sandbox (`SandboxPushMessage`); o real exige `PUSH_PROVIDER="webpush"` e só alcança `PUSH_ALLOWED_USERS`. Nunca use o celular de um profissional para teste.
- **O aviso diz só o horário** (`confirmationPushBody`): nunca paciente, tipo, unidade ou nome da conta, porque aparece na tela bloqueada. O teste confere. Antes de enviar, `notify.ts` confere a sessão e o acesso à conta; `PushSubscription` morre com a sessão.
- Teste no Chromium: `asInstalledApp` e `withFakePushService` de `e2e/pwa.spec.ts`. Instalar e receber aviso no celular é manual (D-79).

## Indicadores (D-74, D-75)

- Contas em `src/lib/indicators/rules.ts`, puro e sem banco; leituras em `indicators.ts`, por conta, pelo cliente com escopo. Sem o que dividir, `value` é `null` e a tela diz "Sem dados": nunca um zero inventado.
- `src/lib/indicators/seed.test.ts` roda `seedDemo(now)` num domingo conhecido e compara com números contados à mão. **Mudou o seed, conte de novo à mão**, sem usar as regras.
- Entre contas só `loadOrganizationIndicators` (`reports:consolidated`), limitado à organização do admin e lendo cada conta pelo cliente dela.
- Tempo da secretária: `recordConfirmationWorkMinute`, pela batida de `work-timer.tsx` enquanto Pendências mostra os Sem confirmação (D-84). O tempo de uma pessoa nunca aparece em tela.

## Isolamento por conta (regra obrigatória, D-02 e D-30)

- Todo acesso a dados de uma conta passa por `forPractice(practiceId)` de `src/lib/db`. Ele filtra toda leitura pela conta, recusa dado que aponte para outra conta e bloqueia SQL bruto e modelos que cruzam contas.
- O cliente base (`prisma`) só entra no seed, nos testes, na autenticação (inclusive o aceite de convite e a lista de contas do usuário) e em serviços que cruzam contas por definição (organização, vínculo Google), sempre com um comentário dizendo por quê.
- No cliente com escopo, passe `practiceId` explícito no `create` (os tipos exigem) e use chaves estrangeiras escalares (`patientId`), nunca `connect`.
- Modelo novo com dado de conta: campo `practiceId`, `@@unique([id, practiceId])`, relações com outros modelos da conta por FK composta `[xId, practiceId]` e entrada em `PRACTICE_SCOPED_MODELS`. Migração nova que cria tabela com `practiceId` precisa criar o trigger `<tabela>_practice_immutable` (ver a migração `init`). Os testes `schema guard` e `database triggers` falham se faltar algo.
- Não navegue de um modelo da conta para as relações de `User` (`memberships` etc.): elas mostram outras contas.
- `AuditEvent` é só inserção (trigger no banco). Guarda IDs e nomes de campos alterados, nunca valor pessoal (D-28).

## Convenções

- Textos de interface em português. Código em inglês: identificadores, comentários, mensagens de erro internas e nomes de testes. Rótulos dos enums em `src/lib/domain/labels.ts`.
- Datas em UTC no banco (`timestamptz`). Exibição, janela de envio e passos da régua usam o fuso da unidade (`Location.timeZone`, padrão America/Fortaleza). Nunca o fuso do servidor.
- Dinheiro em centavos (`Int`, campos `...Cents`). Valor e duração são copiados para o agendamento na criação (D-12).
- IDs são UUID gerados pelo banco.
- Testes que usam banco ficam ao lado do código (`*.test.ts`) e criam os próprios dados; não dependem do seed.

## Glossário (PRD → código, D-29)

| PRD | Código |
| --- | --- |
| Organização | `Organization`, `OrganizationMember` |
| Conta (consultório) | `Practice` |
| Unidade | `Location` |
| Profissional | `Professional`, `ProfessionalLocation` |
| Usuário, papel | `User`, `Membership`, `Role` (mais `ORG_ADMIN` em `AccessRole`) |
| Sessão, forma de login, 2FA | `Session`, `Account` (Better Auth; não é a "conta" do PRD), `Verification`, `TwoFactor` |
| Convite | `Invitation` |
| Paciente, consentimento | `Patient`, `ContactConsent` |
| Tipo de atendimento, valor por profissional | `AppointmentType`, `AppointmentTypePrice` |
| Horário de atendimento, exceção, bloqueio | `WorkingHours`, `ScheduleException`, `TimeBlock` |
| Agendamento, histórico, marcador | `Appointment`, `AppointmentStatusChange`, `AppointmentFlag` |
| Régua, passo, disparo | `Cadence`, `CadenceStep` (com `cadenceVersion`), `Dispatch` |
| Provedor de mensagens falso | `SandboxMessage` |
| Instância WhatsAPI | `WhatsappInstance` |
| Vínculo Google, calendário secundário, pendência | `GoogleConnection`, `GoogleSecondaryCalendar`, `PendingGoogleChange` |
| Calendários do vínculo, link de vínculo, Google falso | `GoogleCalendar`, `GoogleLinkRequest`, `SandboxGoogleCalendar` e `SandboxGoogleEvent` |
| Conta da Synkronos, token do FlwChat | `CrmAccount` |
| Vínculo do consultório com a conta da Synkronos | `CrmConnection` |
| Ação da secretária no CRM, etiqueta de comando | `CrmInboundEvent`, `CRM_COMMAND_TAGS` |
| CRM falso | `SandboxCrmContact`, `SandboxCrmNote` e `SandboxCrmSubscription` |
| Dispositivo lembrado | `Session.rememberedDevice` |
| Assinatura de aviso do aparelho, Web Push falso | `PushSubscription`, `SandboxPushMessage` |
| Minutos em Pendências com os Sem confirmação | `ConfirmationWorkTime` |
| Primeiro admin da organização (convite) | `Invitation.organizationAdmin` |
| Limite de tentativas de login | `RateLimit` |
| Erro por conta | `ServerError` |
| Trilha de auditoria | `AuditEvent` |
