# Decisões do projeto

Registro das decisões do Sistema de Agendamento de Consultas. Cada decisão nova entra no fim, com número sequencial, data, motivo e onde foi aplicada no `docs/PRD.md`.

Status possíveis:

- **Decidida**: vale para o código e o PRD já reflete.
- **Pendente de validação**: depende de alguém de fora. O código segue a premissa provisória até a decisão sair; quando sair, atualize a entrada, o PRD e o status.

## Decisões de 20/10/2026

| Pergunta | Decisão |
| --- | --- |
| Canal de WhatsApp | WhatsAPI, uma instância por profissional; conversas na SynkronosCRM via API do FlwChat |
| Valor por tipo | Só informativo no MVP; sem Pix nem link |
| Convênio | Campo simples no agendamento e no paciente, sem TISS |
| App do profissional | PWA; app nativo fica para a fase 3 |
| Unidades por conta | Sim, já no MVP |
| Migração de agenda | Por planilha, com modelo CSV; iClinic e Feegow sem importação direta no MVP |

## Revisão do PRD em 27/10/2026

D-01 a D-25 correspondem, na mesma ordem, aos pontos da revisão do PRD. D-26 e D-27 surgiram ao transcrever o roadmap do PRD original, que estava num diagrama e não veio no export para Markdown. D-28 saiu da D-19, quando a base legal foi decidida e a questão da exclusão continuou aberta.

| ID | Tema | Status |
| --- | --- | --- |
| D-01 | Login com Google separado do vínculo da agenda | Decidida |
| D-02 | Better Auth e isolamento por conta na aplicação | Decidida |
| D-03 | Fuso horário por unidade | Decidida |
| D-04 | Entidades do Bloco 1 e profissional em mais de uma conta | Decidida |
| D-05 | Número compartilhado entre WhatsAPI e SynkronosCRM | Decidida |
| D-06 | Confirmação encerra só os pedidos de confirmação | Decidida |
| D-07 | Passo fora da janela, margem e limite de 4 h | Decidida |
| D-08 | Leitura da resposta e agendamento de destino | Decidida |
| D-09 | Fila com instância desconectada | Decidida |
| D-10 | Status Chegou e permissões do profissional | Decidida |
| D-11 | Transições de status e reagendamento | Decidida |
| D-12 | Valor e duração copiados para o agendamento | Decidida |
| D-13 | Lista Sem baixa e definição de previsto e realizado | Decidida |
| D-14 | Nome exibido do tipo de atendimento | Decidida |
| D-15 | Bloqueios vindos do Google | Decidida |
| D-16 | 2FA exigível por conta | Decidida |
| D-17 | Sessão longa na PWA | Decidida |
| D-18 | Importação por planilha | Decidida |
| D-19 | LGPD: base legal | Decidida |
| D-20 | Roadmap transcrito em texto | Decidida |
| D-21 | Fase marcada nos itens fora do MVP | Decidida |
| D-22 | Busca e cadastro de paciente no Bloco 3 | Decidida |
| D-23 | Telas de configuração do MVP | Decidida |
| D-24 | App OAuth em produção e URL pública para webhooks | Decidida |
| D-25 | Ajustes menores de texto | Decidida |
| D-26 | Indicadores no MVP | Decidida |
| D-27 | Agendamento online na fase 3 | Decidida |
| D-28 | LGPD: exclusão a pedido do titular e trilha de auditoria | Decidida |
| D-29 | Nomes em inglês no código, com glossário | Decidida |
| D-30 | Integridade entre contas garantida também no banco | Decidida |
| D-31 | Trilha de auditoria só de inserção no banco | Decidida |
| D-32 | Ambiente local e banco de testes | Decidida |
| D-33 | Prisma 7 e versões fixadas | Decidida |
| D-34 | Modelo `User` com os campos do Better Auth | Decidida |
| D-35 | Configuração do Better Auth | Decidida |
| D-36 | 2FA exigido pela conta | Decidida |
| D-37 | Renovação da sessão de 12 h | Decidida |
| D-38 | Convite | Decidida |
| D-39 | Seletor de conta e admin da organização | Decidida |
| D-40 | Permissões por papel | Decidida |
| D-41 | Agenda na URL, grade por hora e fuso por unidade | Decidida |
| D-42 | Cadastro de tipos de atendimento | Decidida |
| D-43 | Conflito de horário, encaixe e horário de atendimento | Decidida |
| D-44 | Status, histórico e remarcação | Decidida |
| D-45 | Busca e cadastro rápido de paciente | Decidida |
| D-46 | shadcn/ui e Playwright | Decidida |
| D-47 | Consentimento de contato | Decidida |
| D-48 | Importação por planilha | Decidida |
| D-49 | Exportação e exclusão a pedido do titular | Decidida |
| D-50 | Tela Pacientes, permissões e desempenho da busca | Decidida |
| D-51 | WhatsAPI, provedor de mensagens e webhook | Decidida |
| D-52 | Quando cada passo sai | Decidida |
| D-53 | Plano, parada e versões da régua | Decidida |
| D-54 | Fila de envio no Inngest e instância desconectada | Decidida |
| D-55 | Respostas do paciente | Decidida |
| D-56 | Telas da régua, log de disparos e Sem confirmação | Decidida |
| D-57 | Teste com a WhatsAPI real | Decidida |
| D-58 | Provedor do Google, sandbox e googleapis | Decidida |
| D-59 | Vínculo OAuth do profissional | Decidida |
| D-60 | O que vira bloqueio | Decidida |
| D-61 | Leitura do Google: janela, push e polling | Decidida |
| D-62 | Exportação para o calendário secundário | Decidida |
| D-63 | Pendências e conflitos | Decidida |
| D-64 | Telas do Google Agenda | Decidida |
| D-65 | Teste com o Google real | Decidida |
| D-66 | Ação da secretária na Synkronos: etiqueta de comando | Decidida |
| D-67 | Webhook da Synkronos sem assinatura | Decidida |
| D-68 | O que vai para a Synkronos, token e tela | Decidida |
| D-69 | Reconciliação diária | Decidida |
| D-70 | Teste com o FlwChat real | Decidida |
| D-71 | Tela do "exigir 2FA" | Decidida |
| D-72 | Cache Components desligado, para o status HTTP valer | Decidida |
| D-73 | Conta da Synkronos compartilhada por consultórios | Decidida |
| D-74 | Painel de indicadores: leitura da tabela da seção 8 | Decidida |
| D-75 | Tempo da secretária e adoção: o que passa a ser medido | Decidida |
| D-76 | PWA do profissional: rotas, service worker sem dados e sem conexão | Decidida |
| D-77 | Dispositivo lembrado: 30 dias, só a pedido e só do profissional | Decidida |
| D-78 | Web Push por confirmação | Decidida |
| D-79 | Teste em aparelho real | Testado; Sair no Android não repetido após a correção |
| D-80 | Banco local por 127.0.0.1 | Decidida |
| D-81 | Navegação: menu lateral e topo com busca | Decidida |
| D-82 | Agenda enxuta: faixa de resumo, cartão sem valor, horário livre clicável | Decidida |
| D-83 | Detalhe do agendamento em painel, por parâmetro na URL | Decidida |
| D-84 | Pendências: lista única do que espera alguém | Decidida |
| D-85 | Bloqueio manual e o evento "Bloqueado" no Google | Decidida |
| D-86 | Telas de Unidades e horários | Decidida |
| D-87 | Trilha de auditoria na tela | Decidida |
| D-88 | Esqueci minha senha | Decidida |
| D-89 | Cadastro de paciente na tela Pacientes | Decidida |
| D-90 | Gmail como provedor de e-mail | Decidida; envio real validado com mensagem de teste |
| D-91 | Cadastro de profissional e ligação com as unidades | Decidida |
| D-92 | Nenhuma tela espera o Inngest | Decidida |
| D-93 | Primeira conta: comando do operador | Decidida |
| D-94 | Instância de WhatsApp na tela do profissional | Decidida |
| D-95 | Preview não é produção | Decidida |
| D-96 | Limite de tentativas no banco | Decidida |
| D-97 | Banco e deploy | Decidida |
| D-98 | Seed e comandos destrutivos só neste computador | Decidida |
| D-99 | Página inicial e política de privacidade | Decidida; texto provisório |
| D-100 | Execuções do Inngest: a conta | Decidida; começa no plano gratuito |
| D-101 | Observabilidade sem serviço de fora | Decidida |
| D-102 | Cabeçalhos de segurança | Decidida |
| D-103 | Backup de 7 dias no piloto | Decidida |
| D-104 | Repositório público | Decidida |
| D-105 | Check numa sessão na nuvem | Decidida |

### D-01 · Login com Google separado do vínculo da agenda

- **Status:** Decidida em 27/10/2026.
- **Decisão:** o login com Google pede só identidade (e-mail e perfil). O escopo de calendário é pedido num fluxo OAuth próprio, com googleapis, iniciado pelo profissional ou por um link que o gestor envia a ele. O refresh token fica criptografado na entidade Vínculo Google.
- **Motivo:** se o login pedisse escopo de calendário, toda secretária que entra com Google concederia acesso à própria agenda sem motivo. Além disso, o Supabase Auth só entrega o token do provedor no momento do login e não o guarda nem o renova.
- **No PRD:** seção 3 (entidade Vínculo Google, papel do gestor, requisito 6), seção 5 (Vínculo), seção 12 (stack).

### D-02 · Better Auth e isolamento por conta na aplicação

- **Status:** Decidida em 27/10/2026.
- **Decisão:** Better Auth para o login (e-mail e senha, e Google só com identidade). O isolamento por conta fica numa extensão do Prisma que injeta o id da conta (`practiceId` no código, D-29) em toda query, coberta pelo teste do Bloco 1; o RLS do banco não é a barreira. A escolha entre Supabase e Neon para o banco continua aberta.
- **Motivo:** o Auth.js passou a ser mantido pelo time do Better Auth em setembro de 2025, e esse time recomenda o Better Auth para projetos novos. Com o Prisma conectando como dono das tabelas, o RLS do Supabase não se aplica sem configuração extra.
- **No PRD:** seção 7 (Isolamento), seção 12 (stack e preparação).

### D-03 · Fuso horário por unidade

- **Status:** Decidida em 27/10/2026.
- **Decisão:** cada unidade tem fuso próprio, com America/Fortaleza como padrão. Datas ficam em UTC no banco; exibição, janela de envio e passos da régua seguem o fuso da unidade.
- **Motivo:** a operação de secretárias remotas atende consultórios em estados com outro fuso (Manaus, Cuiabá, Rio Branco), e regras como "D-1 às 18h" dependem do horário local.
- **No PRD:** seção 3 (Unidade, requisito 8), seção 4 (regra 8), seção 6 (janela de envio), seção 7 (Datas e fuso), seção 12 (preparação).

### D-04 · Entidades do Bloco 1 e profissional em mais de uma conta

- **Status:** Decidida em 27/10/2026.
- **Decisão:** o schema do Bloco 1 já inclui horário de atendimento e exceções por profissional, unidade e dia; valor por profissional; histórico de status; consentimento; marcadores; convite; bloqueio; vínculo Google; calendário secundário; instância WhatsAPI; e pendência do Google. O mesmo médico em duas contas são dois Profissionais, que podem apontar para o mesmo Usuário e o mesmo Vínculo Google. Cada conta tem o próprio calendário secundário e a própria instância WhatsAPI.
- **Motivo:** o PRD exige essas regras, e cada entidade deixada para depois vira migração e retrabalho de seed nos blocos seguintes.
- **No PRD:** seção 3 (Entidades), seção 4 (regra 1), seção 5 (Vínculo), seção 12 (Bloco 1).

### D-05 · Número compartilhado entre WhatsAPI e SynkronosCRM

- **Status:** Decidida em 27/10/2026, com a resposta de Felipe Guedes.
- **Resposta:** na SynkronosCRM, os números estão conectados pela Z-API; neste sistema, serão conectados pela WhatsAPI. As duas são aparelhos conectados por QR ao mesmo número.
- **Decisão:**
  - O sistema lê as respostas do paciente só pelo webhook da WhatsAPI. Como as duas conexões recebem as mesmas mensagens, o evento "mensagem recebida fora da régua" da Synkronos não é usado.
  - Da Synkronos, o sistema recebe só as ações da secretária: contato manual e confirmação na conversa.
  - As mensagens da régua saem do mesmo número e aparecem na conversa da Synkronos pela sincronização entre aparelhos conectados. O Bloco 5 conferiu isso com um número de teste (D-57).
- **Motivo:** com as duas conexões recebendo tudo, ler as respostas pelos dois lados faria cada resposta ser processada duas vezes.
- **Risco novo:** cada número ocupa duas das quatro vagas de aparelho conectado do WhatsApp e passa a ter duas integrações não oficiais. O risco entrou na tabela da seção 10.
- **No PRD:** seção 6 (Canal, Respostas e ações, Integração com a SynkronosCRM), seção 10 (riscos), seção 12 (blocos 5 e 7, exemplo de prompt).

### D-06 · Confirmação encerra só os pedidos de confirmação

- **Status:** Decidida em 27/10/2026.
- **Decisão:** cada passo da régua tem uma ação esperada: pedir confirmação ou só lembrar. A confirmação encerra os passos que pedem confirmação; os lembretes com status elegível Confirmado continuam. O cancelamento encerra a régua inteira. O contato manual marcado pela secretária encerra os pedidos de confirmação.
- **Motivo:** a seção 6 mandava a régua parar na confirmação e, ao mesmo tempo, permitia passos para quem estava Confirmado. Desse jeito, o lembrete H-3 para quem já confirmou nunca sairia.
- **No PRD:** seção 6 (Passos, Parada, Respostas e ações).

### D-07 · Passo fora da janela, margem e limite de 4 h

- **Status:** Decidida em 27/10/2026.
- **Decisão:**
  - Passo anterior ao atendimento que cai fora da janela é antecipado para o último horário válido antes dele.
  - Se esse horário já passou, o passo é adiado para o próximo horário válido, desde que fiquem pelo menos 2 h antes do atendimento (margem configurável pela conta). Se não couber, o passo é pulado e o pulo fica no log.
  - Os passos "ao agendar" e de pós-atendimento só são adiados.
  - Passo cujo horário já passou no momento do agendamento é pulado.
  - Passo barrado pelo limite de 4 h é adiado até o fim do intervalo, com a mesma janela e a mesma margem.
- **Motivo:** sem regra, o H-3 de um atendimento às 8h e o D-1 de um atendimento na segunda eram adiados para a hora do próprio atendimento. A revisão propunha só adiar ou pular. A antecipação foi acrescentada ao aplicar a proposta: com domingo fora da janela, todo atendimento de segunda perderia o D-1.
- **No PRD:** seção 6 (Janela de envio, regra 5).

### D-08 · Leitura da resposta e agendamento de destino

- **Status:** Decidida em 27/10/2026.
- **Decisão:** só vale resposta exata depois de normalizar (minúsculas, sem acento, sem espaços e pontuação nas pontas):
  - "1", "sim" ou "confirmo" confirmam;
  - "2" ou "remarcar" pedem remarcação;
  - "3", "nao" ou "cancelar" cancelam.

  O resto é texto livre. A resposta vale para o agendamento da última mensagem de régua enviada por aquela instância àquele paciente, desde que o atendimento ainda esteja no futuro. Evento da Synkronos que não identifica o agendamento segue a mesma regra.
- **Motivo:** um paciente com dois agendamentos no mesmo profissional deixava a resposta ambígua. E uma frase como "não consigo às 10, pode às 11?" contém "não" e cancelaria o horário.
- **No PRD:** seção 6 (Leitura da resposta, tabela da Synkronos).

### D-09 · Fila com instância desconectada

- **Status:** Decidida em 27/10/2026.
- **Decisão:** enquanto a instância está desconectada, os disparos ficam na fila. Na reconexão, são enviados só os passos vencidos há menos de 2 h cujo atendimento ainda está no futuro. Os demais ficam no log como falhou, com o motivo "instância desconectada". Gestor e profissional recebem alerta ao desconectar.
- **Motivo:** o PRD trazia três redações diferentes da regra, e nenhuma dizia o que fazer quando a instância fica fora por dias.
- **No PRD:** seção 6 (regra 8), seção 7 (Disponibilidade), seção 10 (riscos).

### D-10 · Status Chegou e permissões do profissional

- **Status:** Decidida em 27/10/2026.
- **Decisão:** novo status Chegou, entre Confirmado e Em atendimento. O profissional pode marcar chegada e resolver as pendências do Google da própria agenda, além da secretária e do gestor.
- **Motivo:** a lista do dia e a PWA tinham "marcar chegada" sem status correspondente. A tabela de papéis não dava ao profissional essa ação nem a de resolver a pendência que a PWA mostra.
- **No PRD:** seção 3 (papéis), seção 4 (status e transições), seção 5 (regra 3).

### D-11 · Transições de status e reagendamento

- **Status:** Decidida em 27/10/2026.
- **Decisão:** a seção 4 traz a tabela de transições válidas. Status finais (Atendido, Faltou, cancelamentos) só mudam por correção do gestor ou do admin, com motivo obrigatório. Reagendar cria um agendamento novo ligado ao original, que fica como Reagendado; a régua reinicia no agendamento novo.
- **Motivo:** sem transições definidas, cada tela inventaria as suas. Reagendar editando o registro original perderia o histórico e distorceria as métricas.
- **No PRD:** seção 4 (Agendamento, Transições de status, regra 6), seção 6 (regra 2).

### D-12 · Valor e duração copiados para o agendamento

- **Status:** Decidida em 27/10/2026.
- **Decisão:** valor e duração do tipo são copiados para o agendamento na criação, e mudar o tipo não altera agendamentos existentes. A duração continua editável no agendamento; o valor só pode ser ajustado ali por gestor ou admin, coerente com a secretária só visualizar valores.
- **Motivo:** se o preço do tipo mudar em novembro, os atendimentos de outubro não podem mudar de valor nos indicadores.
- **No PRD:** seção 4 (Cadastro de tipo).

### D-13 · Lista Sem baixa e definição de previsto e realizado

- **Status:** Decidida em 27/10/2026.
- **Decisão:**
  - **Sem baixa:** agendamentos com horário já passado que seguem em Agendado, Confirmado, Chegou ou Em atendimento. Aparecem na lista do dia a partir do fim do dia do atendimento, até alguém dar baixa.
  - **Valor previsto:** soma dos agendamentos do período que não foram cancelados nem reagendados.
  - **Valor realizado:** soma dos Atendidos.
  - **Indicadores:** deixam os casos Sem baixa de fora e mostram quantos são. A métrica previsto vs realizado da seção 8 usa as mesmas definições do painel.
- **Motivo:** a taxa de falta e o valor realizado dependem de alguém marcar Atendido ou Faltou. Além disso, o painel e a métrica usavam definições diferentes de "agendados".
- **No PRD:** seção 4 (Visualizações), seção 8 (Taxa de falta, Valor previsto vs realizado), seção 12 (Bloco 3).

### D-14 · Nome exibido do tipo de atendimento

- **Status:** Decidida em 27/10/2026.
- **Decisão:** o tipo ganha o campo "nome exibido", usado no título do evento do Google e na variável {tipo} da régua. O padrão é a categoria (Consulta, Procedimento, Exame…).
- **Motivo:** nomes como "Vasectomia" ou "Teste de HIV" no Google ou no WhatsApp são dado de saúde saindo do sistema, contra a regra 5 da seção 5.
- **No PRD:** seção 4 (Cadastro de tipo), seção 5 (Fluxo de dados, regra 5), seção 6 (Variáveis), seção 10 (riscos), seção 11.

### D-15 · Bloqueios vindos do Google

- **Status:** Decidida em 27/10/2026.
- **Decisão:**
  - O calendário secundário da própria conta nunca conta como ocupado; o de outra conta do mesmo profissional conta.
  - Evento de dia inteiro bloqueia por padrão, com opção de desligar no perfil do profissional.
  - Um job diário mantém a janela móvel de 90 dias à frente.
- **Motivo:**
  - Pela regra 1 original, o calendário secundário (que tem permissão de escrita) devolveria cada atendimento exportado como "Compromisso Google".
  - O Google cria eventos de dia inteiro como "livre", então férias e congressos lançados assim não bloqueariam.
  - A importação de 90 dias deixava de fora eventos já existentes mais adiante.
- **No PRD:** seção 5 (regras 1, 2 e 7), seção 12 (Bloco 6).

### D-16 · 2FA exigível por conta

- **Status:** Decidida em 27/10/2026.
- **Decisão:** 2FA é opcional para qualquer usuário. Uma conta pode exigir 2FA dos seus usuários; se qualquer conta do usuário exigir, o login pede o segundo fator.
- **Motivo:** 2FA é do usuário, não da conta, e uma secretária pode estar em dez contas com regras diferentes.
- **No PRD:** seção 3 (requisito 7), seção 7 (Segurança), seção 12 (Bloco 2).

### D-17 · Sessão longa na PWA

- **Status:** Decidida em 27/10/2026.
- **Decisão:** na web, a sessão expira em 12 h de inatividade. Na PWA, em dispositivo lembrado, a sessão dura 30 dias.
- **Motivo:** com 12 h, o médico faria login toda manhã, e a notificação de confirmação abriria numa tela de senha.
- **No PRD:** seção 7 (Segurança).

### D-18 · Importação por planilha

- **Status:** Decidida em 27/10/2026.
- **Decisão:** pacientes são deduplicados pelo celular dentro da conta. Agendamentos futuros importados entram com a régua desligada, com ativação em lote pelo gestor, e são exportados para o Google Agenda.
- **Motivo:** o PRD não dizia se os importados disparam régua, vão para o Google ou duplicam pacientes. Ligar a régua para centenas de agendamentos de uma vez sem revisão é arriscado.
- **No PRD:** seção 4 (regra 9), seção 12 (Bloco 4).

### D-19 · LGPD: base legal

- **Status:** Decidida em 27/10/2026, por Felipe Guedes.
- **Decisão:** a base legal listada para a agenda é a execução de contrato. Ao lado dela, o PRD cita o exercício regular de direitos em contrato (art. 11, II, d) como a hipótese correspondente para o dado sensível. O consentimento continua sendo a base para o WhatsApp.
- **Motivo:** a revisão apontou que o art. 11 da LGPD, que trata de dado sensível, não lista a execução de contrato. A decisão foi manter a execução de contrato; a citação do art. 11 ao lado dela cobre a parte sensível sem mudar a base escolhida.
- **Separado:** a questão de como a exclusão convive com a trilha de auditoria imutável continua aberta, agora como D-28.
- **No PRD:** seção 7 (LGPD).

### D-20 · Roadmap transcrito em texto

- **Status:** Decidida em 27/10/2026.
- **Decisão:** as três fases e os dois gates, que estavam só num diagrama do PRD original, viraram tabela na seção 9:
  - Gate 1: 3 contas piloto com falta abaixo de 15%.
  - Gate 2: 20 contas ativas com entrega de WhatsApp acima de 95%.
- **Motivo:** no export para Markdown o diagrama virou "[embedded content: roadmap · 3 fases, 2 gates]", e o Claude Code não veria os gates nem as fases.
- **No PRD:** seção 9 (Roadmap).

### D-21 · Fase marcada nos itens fora do MVP

- **Status:** Decidida em 27/10/2026.
- **Decisão:** cada item fora do MVP traz a fase no próprio texto, por exemplo "(fase 2)". Recorrência e recebimento por Pix ou link aparecem como "sem fase".
- **Motivo:** regras como lista de espera e recorrência apareciam nas seções 4 e 6 sem aviso, e o Claude Code tende a construir o que está escrito como regra.
- **No PRD:** seção 4 (regras 4 e 5), seção 6 (Passos), seção 9 (Fora do MVP).

### D-22 · Busca e cadastro de paciente no Bloco 3

- **Status:** Decidida em 27/10/2026.
- **Decisão:** a busca e o cadastro rápido de paciente vão para o Bloco 3. O Bloco 4 fica com consentimento, importação CSV e exportação do titular.
- **Motivo:** o novo agendamento do Bloco 3 precisa de busca e cadastro inline de paciente, que estavam no Bloco 4.
- **No PRD:** seção 12 (Ordem de construção).

### D-23 · Telas de configuração do MVP

- **Status:** Decidida em 27/10/2026.
- **Decisão:** a seção 11 lista as telas sem mockup necessárias no MVP:
  - Pacientes;
  - Usuários e papéis;
  - Unidades e horários;
  - Perfil do profissional;
  - Configurações da conta;
  - listas de trabalho (Sem confirmação, Sem baixa, Pendências do Google);
  - Log de disparos;
  - Indicadores.
- **Motivo:** várias regras do MVP (horário por unidade, vínculo Google, instância WhatsAPI, janela de envio, token do FlwChat, 2FA) não tinham tela onde ser configuradas.
- **No PRD:** seção 11.

### D-24 · App OAuth em produção e URL pública para webhooks

- **Status:** Decidida em 27/10/2026.
- **Decisão:** o app OAuth do Google é criado e tem a verificação pedida na semana 1. Até a verificação sair, ele fica publicado em produção (com a tela de app não verificado e o limite de 100 usuários), nunca em Testing. Os webhooks têm URL HTTPS pública já no desenvolvimento, por túnel ou preview da Vercel.
- **Motivo:** em Testing, o Google emite refresh token que expira em 7 dias, o que derrubaria o vínculo dos médicos do piloto toda semana. O push do Google e o webhook da WhatsAPI não chegam em localhost.
- **No PRD:** seção 10 (riscos), seção 12 (preparação, itens 6 e 7).

### D-25 · Ajustes menores de texto

- **Status:** Decidida em 27/10/2026.
- **Decisão:**
  - Next.js 15 virou 16, que é a LTS ativa e a versão que o `create-next-app` instala.
  - "A seção 11 traz o plano" virou seção 12.
  - Os itens 7 e 8 da seção 3 voltaram para a lista numerada.
  - A seção 11 passou a dizer cor por tipo (família pela categoria), como a seção 4.
  - A meta de falta na abertura da seção 8 passou de 60 para 90 dias, igual à tabela.
- **Motivo:** inconsistências de texto que confundiriam o Claude Code. Na meta de falta, a tabela de metas (90 dias) foi tomada como referência; se a intenção era 60 dias, basta trocar os dois lugares.
- **No PRD:** seções 1, 3, 8, 11 e 12.

### D-26 · Indicadores no MVP

- **Status:** Decidida em 27/10/2026.
- **Decisão:** os indicadores da seção 8 entram no MVP, construídos no Bloco 8. O item "Painel de indicadores" sai da fase 2.
- **Motivo:** conflito encontrado ao transcrever o roadmap: o diagrama punha o painel de indicadores na fase 2, mas o Bloco 8 já o constrói, e o Gate 1 (falta abaixo de 15%) só pode ser medido com a taxa de falta funcionando.
- **No PRD:** seção 9 (Roadmap, Dentro do MVP), seção 11, seção 12 (Bloco 8).

### D-27 · Agendamento online na fase 3

- **Status:** Decidida em 27/10/2026.
- **Decisão:** o agendamento online pelo paciente fica na fase 3, como no roadmap. O campo "Permite agendamento online" do tipo passa a dizer fase 3.
- **Motivo:** conflito encontrado ao transcrever o roadmap: a seção 4 dizia fase 2 e o diagrama dizia fase 3. Valeu o roadmap, que é o plano de fases com gates.
- **No PRD:** seção 4 (Cadastro de tipo), seção 9.

### D-28 · LGPD: exclusão a pedido do titular e trilha de auditoria

- **Status:** Decidida em 27/10/2026, por Felipe Guedes.
- **Decisão:** a exclusão a pedido do titular pseudonimiza: o registro na trilha de auditoria fica e os dados pessoais saem.
- **Como fica no código:**
  - O cadastro do paciente perde nome, celular, convênio e observações e passa a aparecer como "Paciente excluído".
  - Os agendamentos continuam, sem dado pessoal, para os indicadores não mudarem.
  - Os eventos do paciente no Google Agenda perdem o primeiro nome do título.
  - Os eventos de auditoria guardam IDs e os nomes dos campos alterados, nunca cópia de valor pessoal. Assim a trilha continua imutável, e a exclusão não precisa reescrevê-la.
- **Motivo:** a premissa provisória foi confirmada. A forma de gravar a auditoria precisa nascer assim no Bloco 1; mudar depois exigiria reescrever eventos já gravados.
- **Origem:** segunda pergunta da D-19, separada quando a base legal foi decidida.
- **No PRD:** seção 7 (LGPD), seção 9 (Dentro do MVP), seção 10 (Perguntas em aberto), seção 12 (blocos 1 e 4).

## Bloco 1 em 27/10/2026

Decisões tomadas na preparação do repositório e no Bloco 1 (schema, isolamento e seed).

### D-29 · Nomes em inglês no código, com glossário

- **Status:** Decidida em 27/10/2026.
- **Decisão:** entidades e campos ficam em inglês, como pede a convenção da seção 12, com um glossário PRD → código no `CLAUDE.md`. A "conta" (consultório) virou `Practice`, e não `Account`, porque `Account` é o nome que o Better Auth usa para as contas OAuth no Bloco 2. O campo de isolamento é `practiceId`, o `contaId` citado na D-02.
- **No PRD:** seção 7 (Isolamento), seção 12 (stack).

### D-30 · Integridade entre contas garantida também no banco

- **Status:** Decidida em 27/10/2026.
- **Decisão:** além da extensão do Prisma (D-02):
  - todo modelo da conta tem `@@unique([id, practiceId])` e referencia outros modelos da conta por chave estrangeira composta `[xId, practiceId]`. O banco recusa, por exemplo, um agendamento com paciente de outra conta, mesmo vindo do cliente base;
  - um trigger em toda tabela com `practiceId` impede que esse valor mude. Sem ele, o `ON UPDATE CASCADE` padrão do Prisma permitiria mover dados de uma conta para outra;
  - o cliente com escopo recusa `connect`, `connectOrCreate`, `disconnect` e a relação `practice`, e trabalha com chaves estrangeiras escalares;
  - no cliente com escopo, `User` só mostra membros da conta e sem relações; `Organization`, `OrganizationMember`, `GoogleConnection` e SQL bruto ficam fora.
- **Motivo:** a extensão sozinha protege só a operação principal; relações aninhadas e o cliente base passavam por fora dela. O teste do Bloco 1 cobre os dois níveis, e a guarda do schema falha se um modelo novo fugir do padrão.
- **Limite conhecido:** incluir as relações de `User` a partir de um modelo da conta (por exemplo, `professional` → `user` → `memberships`) não é bloqueado pela extensão; ficou como regra no `CLAUDE.md`.
- **No PRD:** seção 7 (Isolamento), seção 12 (Bloco 1).

### D-31 · Trilha de auditoria só de inserção no banco

- **Status:** Decidida em 27/10/2026.
- **Decisão:** triggers impedem UPDATE, DELETE e TRUNCATE em `AuditEvent`, e o cliente com escopo também recusa essas operações. O evento não tem campo JSON livre: guarda só ator, ação, entidade, id e nomes dos campos alterados (D-28).
- **Consequência:** linhas de demonstração não podem ser apagadas uma a uma. Para recriar o banco de desenvolvimento, use `npm run db:reset`.
- **No PRD:** seção 7 (Segurança).

### D-32 · Ambiente local e banco de testes

- **Status:** Decidida em 27/10/2026.
- **Decisão:** Postgres 17 no Docker (`docker-compose.yml`), com o banco `agenda` para desenvolvimento e `agenda_test` para os testes. `npm test` recria o schema de `agenda_test` a partir das migrações a cada execução e só aceita banco cujo nome termine em `_test`. Supabase ou Neon continuam como opção para os ambientes hospedados.
- **Motivo:** os testes de isolamento precisam de um Postgres de verdade, por causa das chaves compostas e dos triggers. Além disso, o `prisma migrate reset` é bloqueado para agentes sem consentimento explícito, então os testes não dependem dele.

### D-33 · Prisma 7 e versões fixadas

- **Status:** Decidida em 27/10/2026.
- **Decisão:**
  - `prisma`, `@prisma/client` e `@prisma/adapter-pg` ficam em 7.10.1, a mesma versão, fixada sem `^`.
  - O client é gerado pelo gerador `prisma-client` em `src/generated/prisma`, fora do git e gerado no `postinstall`.
  - O `package.json` libera scripts de instalação só para `prisma`, `@prisma/engines` e `esbuild`, pelo `allowScripts` do npm 11.
  - O `@types/node` foi para a versão 24, a do Node instalado, que o Vitest 5 exige.
- **Motivo:** o `latest` do pacote `prisma` no npm é um 8.0.0-rc. Fixar a versão evita misturar CLI e client, e o `allowScripts` registra versões exatas.

### D-34 · Modelo `User` com os campos do Better Auth

- **Status:** Decidida em 27/10/2026.
- **Decisão:** `User` usa os nomes de campo do usuário do Better Auth (`name`, `email`, `emailVerified`, `image`), para o Bloco 2 só acrescentar sessão, conta OAuth e verificação. Os IDs continuam UUID gerados pelo banco, e o Bloco 2 configura o Better Auth para isso.
- **No PRD:** seção 12 (Bloco 2).

## Bloco 2 em 28/10/2026

Decisões tomadas no Bloco 2 (login, 2FA, convite, seletor de conta e permissões).

### D-35 · Configuração do Better Auth

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - `better-auth` fica fixado em 1.7.14, sem `^`, porque o desafio de 2FA no login com Google (D-36) repete nomes internos do plugin.
  - Adaptador Prisma com o cliente base, porque a autenticação cruza contas por definição. `Session`, `Account`, `Verification` e `TwoFactor` entram em `CROSS_PRACTICE_MODELS`, e as relações novas de `User` ficam escondidas no cliente com escopo.
  - `advanced.database.generateId: "uuid"`: o Better Auth não gera id; vale o `@default(uuid()) @db.Uuid` do schema (D-34).
  - `Account` é o nome que o Better Auth dá às formas de login: "credential", com o hash da senha, ou Google. Não é a "conta" do PRD, que é `Practice` (D-29).
  - Cadastro público desligado (`disableSignUp`): só o convite cria usuário (D-38). O Google recusa e-mail sem convite (`disableImplicitSignUp`) e se junta ao usuário convidado de mesmo e-mail, que nasce com `emailVerified: true`.
  - Google só com `openid email profile`, sem `include_granted_scopes` e sem acesso offline. Os tokens do Google não são guardados (`databaseHooks` zeram os campos): o login não precisa deles, e o token de agenda é o do `GoogleConnection` (D-01).
  - Login, Google, 2FA e saída passam pelo client do Better Auth no navegador, ou seja, pelo route handler `/api/auth`, onde os cookies são gravados e o limite de tentativas vale. `auth.api` chamado de Server Action pularia esse limite; no servidor, ele só faz o login logo depois de o convite criar a senha.
  - Telemetria desligada explicitamente.
- **Motivo:** D-01, D-02 e D-34 já pediam Better Auth com IDs do banco e Google só de identidade; o resto saiu do comportamento conferido no código publicado da versão 1.7.14.
- **No PRD:** seção 3 (requisito 6), seção 12 (Bloco 2).

### D-36 · 2FA exigido pela conta

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - Segundo fator por aplicativo autenticador (TOTP), com 10 códigos de backup, pelo plugin `twoFactor`. Qualquer usuário pode ativar na tela Segurança.
  - O plugin só desafia quem já ativou. Por isso, se uma conta que o usuário alcança tem `requireTwoFactor` e ele ainda não ativou, a guarda (`requireUser`) manda toda página para `/seguranca` até ele ativar. Daí em diante, todo login pede o código.
  - O plugin não desafia o login com Google. Um hook depois do callback do Google troca a sessão recém-criada pelo mesmo desafio que o plugin monta no login por senha; a verificação, o limite de tentativas e o bloqueio do plugin valem sem mudança. O teste de integração cobre o fluxo inteiro com o Google simulado.
  - Quem está numa conta que exige 2FA não consegue desativá-lo (hook antes de `/two-factor/disable`).
  - Sem "lembrar este dispositivo" por enquanto; o dispositivo lembrado da PWA (D-17) ficou para o Bloco 8 e não pula o segundo fator (D-77).
- **Motivo:** a D-16 pede que o login peça o segundo fator quando qualquer conta do usuário exigir. Sem o cadastro forçado, quem nunca ativou entraria só com a senha; sem o hook, o Google seria um atalho que pula o segundo fator.
- **No PRD:** seção 3 (requisito 7), seção 7 (Segurança).

### D-37 · Renovação da sessão de 12 h

- **Status:** Decidida em 28/10/2026.
- **Decisão:** a sessão web vale 12 h e é estendida, no máximo a cada 10 min, quando há atividade. Server Components não conseguem gravar cookie, então as leituras de sessão deles nunca renovam (`disableRefresh`). Quem renova é um componente cliente nas telas autenticadas, que chama `/api/auth/get-session` quando o usuário navega (no máximo a cada 5 min); o route handler estende a sessão e o cookie juntos. Aba parada não renova, e a sessão cai 12 h depois da última navegação.
- **Motivo:** o Better Auth grava o cookie com `Max-Age` igual à validade da sessão. Renovar só no banco, dentro de um Server Component, deixaria o cookie vencer antes da sessão.
- **No PRD:** seção 7 (Segurança).

### D-38 · Convite

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - O link leva um token aleatório de 32 bytes; o banco guarda só o SHA-256 em `Invitation.tokenHash`. Validade de 7 dias e uso único, marcado numa atualização condicional que resiste a dois aceites simultâneos. Um convite novo para o mesmo e-mail cancela o pendente.
  - Quem convida quem: o gestor convida secretárias; o admin da organização convida qualquer papel. Convite de profissional aponta o cadastro (`Invitation.professionalId`, com FK composta) que o usuário assume no aceite.
  - Primeiro acesso: nome, senha de 8 a 128 caracteres e aceite dos termos. O usuário nasce com o e-mail verificado, `termsAcceptedAt` e `termsVersion`. Quem já tem login entra com ele e só aceita; a conta nova aparece no seletor.
  - O aceite cria o login e a primeira alocação numa só transação com o cliente base: o token é a autorização e a conta vem do próprio convite.
  - Só e-mail neste bloco. O convite por WhatsApp entra quando houver envio de mensagens (Bloco 5).
  - Envio de e-mail atrás da interface `EmailSender`. Em desenvolvimento, a mensagem sai no terminal do servidor, com o link; os testes usam uma implementação em memória; em produção, o envio falha até um provedor ser escolhido (Gmail, D-90).
  - Os termos de uso têm texto provisório em `/termos`, na versão `TERMS_VERSION`, até chegar o texto jurídico.
  - Seed: os usuários da demo ganham uma senha de demonstração (constante no `prisma/seed.ts`) e o aceite dos termos. Num banco já populado, o seed só confere esses logins, sem `db:reset`.
- **Motivo:** PRD 3, requisito 3, e a tabela de papéis ("Convida secretárias" para o gestor; "Convida, remove, aloca" para o admin).
- **No PRD:** seção 3 (requisito 3), seção 12 (Bloco 2).

### D-39 · Seletor de conta e admin da organização

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - A conta fica na URL: `/conta/[practiceId]/...`. Trocar de conta não sai da sessão e leva à mesma tela na outra conta quando o papel permite; senão, à página inicial dela.
  - A última conta escolhida fica num cookie (`agenda.ultima_conta`), só como preferência: `/` abre essa conta, ou a única, ou mostra a lista.
  - O acesso vem de `Membership` sem `revokedAt` ou de `OrganizationMember` ativo, que dá o papel `ORG_ADMIN` em todas as contas da organização e prevalece sobre a alocação.
  - Conta sem acesso responde 404, sem revelar se ela existe; tela sem permissão responde 403.
- **Motivo:** com a conta na URL, cada aba e cada link apontam para uma conta só, e a checagem acontece em toda requisição.
- **No PRD:** seção 3 (requisito 2).

### D-40 · Permissões por papel

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - A tabela "Papéis por conta" virou uma matriz em `src/lib/auth/permissions.ts`, com o teste reproduzindo a tabela linha a linha. O admin da organização tem tudo do gestor, mais templates de régua, remover e alocar usuários e o relatório consolidado.
  - Fora da tabela: configurações da conta (D-23) e trilha de auditoria (requisito 4) ficam com gestor e admin.
  - O "middleware" do Bloco 2 tem duas partes. O `proxy.ts`, nome do middleware no Next 16, só faz a checagem otimista que o guia do Next recomenda: sem cookie de sessão, vai para o login. A checagem de verdade fica na camada de dados (`src/lib/auth/guard.ts`), chamada por toda página e Server Action de conta: `requirePracticePermission(practiceId, permissão)` devolve o cliente com escopo só depois de checar sessão, alocação e papel.
  - As telas autenticadas bloqueiam no servidor, para o redirecionamento, o 404 e o 403 saírem com o status HTTP certo (D-72).
- **Motivo:** o guia do Next 16 pede que o proxy não consulte o banco, porque ele roda em toda requisição, inclusive prefetch; e uma Server Action pode ser chamada de qualquer página, então só a checagem perto do dado protege de fato.
- **No PRD:** seção 3 (Papéis por conta), seção 12 (Bloco 2).

## Bloco 3 em 28/10/2026

Decisões tomadas no Bloco 3 (tipos de atendimento, paciente, agenda, status e painel de valor).

### D-41 · Agenda na URL, grade por hora e fuso por unidade

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - A agenda é a página inicial da conta (`/conta/[practiceId]`). Visão, data e filtros ficam na URL: `visao` (dia, semana, mes, lista), `data`, `profissional`, `categoria` e `status`. Valor inválido volta ao padrão (semana de hoje, todos).
  - Semana e dia seguem o mockup: linhas por hora com os cards empilhados, sem posição proporcional ao minuto. Sábado e domingo só aparecem com algo marcado. Dia com "Todos os profissionais" é a visão multiprofissional, uma coluna por profissional; até 8 cabem sem rolagem horizontal. O mês mostra até 3 agendamentos por dia e "+N".
  - Fuso: cada agendamento aparece no dia e na hora da própria unidade (D-03). Quais dias entram no período e os bloqueios usam o fuso da agenda, que é o da primeira unidade ativa da conta.
  - Filtros combináveis: profissional, categoria (Bloqueio mostra só os bloqueios) e status, mais "Sem confirmação" (Agendado com o marcador da régua aberto). O profissional vê só a própria agenda, qualquer que seja o filtro.
  - Painel do período visível, com os filtros: Agendados (o mesmo conjunto do previsto), Sem confirmação, Valor previsto e Valor realizado, nas definições da D-13.
  - Lista do dia: ações rápidas da tabela de status (Confirmar, Chegou, Em atendimento, Atendido, Faltou); cancelar, corrigir e remarcar ficam na tela do agendamento. A seção Sem baixa aparece acima, pelo dia local de cada unidade.
- **Motivo:** com o estado na URL, cada visão tem link, o voltar do navegador funciona e a troca de conta leva à mesma tela. A grade por hora é a do mockup e não precisa calcular sobreposição de cards.
- **No PRD:** seção 4 (Visualizações).

### D-42 · Cadastro de tipos de atendimento

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - Cor de uma paleta fixa de 6 cores, a do mockup (verde, azul, laranja, roxo, rosa e cinza). Num tipo novo, a categoria sugere a cor da família; o card da agenda usa o tom claro da cor.
  - A categoria Bloqueio fica fora do cadastro: bloqueio é `TimeBlock`, e a categoria existe para o filtro da agenda.
  - Tipo não é excluído, só desativado: agendamentos apontam para ele e os indicadores dependem dele. Desativado some do novo agendamento e da visão do profissional.
  - Valor por profissional (`AppointmentTypePrice`) no mesmo formulário; vazio, vale o valor do tipo.
  - A secretária vê todos os tipos com os valores, sem editar. O profissional vê os tipos ativos com o próprio valor.
  - Auditoria `appointment_type.created`, `updated`, `deactivated` e `reactivated`, com os nomes dos campos alterados ("prices" para os valores por profissional).
- **Motivo:** PRD 4 (cadastro de tipo) e D-12. A paleta fixa mantém a família de cores pela categoria (D-25) e a leitura da agenda.
- **No PRD:** seção 4 (Cadastro de tipo de atendimento).

### D-43 · Conflito de horário, encaixe e horário de atendimento

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - Conflito é sobrepor, no mesmo profissional, um agendamento Agendado, Confirmado, Chegou, Em atendimento ou Atendido, ou um bloqueio (manual ou do Google). Encostar não conflita (um termina às 9h30, o outro começa às 9h30). Faltou, cancelado e Reagendado liberam o horário.
  - Encaixe é a permissão nova `appointments:overbook`, de gestor e admin (PRD 4, regra 3). A secretária recebe o erro com a lista do que conflita.
  - A checagem e a gravação rodam numa transação serializável, com até 3 tentativas. Duas pessoas marcando o mesmo horário ao mesmo tempo: só uma consegue (coberto por teste).
  - Horário de atendimento e exceções não bloqueiam o agendamento: aparecem como informação na lateral do novo agendamento. O PRD não proíbe marcar fora do horário, e a tela de Unidades e horários (D-23) ainda não existe.
- **Motivo:** a regra 3 da seção 4 bloqueia conflito por padrão e só o gestor libera. Sem a transação serializável, a checagem e a gravação de duas reservas simultâneas passariam juntas.
- **No PRD:** seção 4 (regra 3).

### D-44 · Status, histórico e remarcação

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - A tabela de transições da seção 4 virou dado em `src/lib/appointments/status.ts`, com o teste percorrendo todos os pares por papel. Toda mudança passa por `changeAppointmentStatus` ou `rescheduleAppointment`, que conferem a tabela, o papel e, para o profissional, se o agendamento é dele. A régua do Bloco 5 usa a mesma tabela.
  - Permissão nova `appointments:attend` (secretária, gestor, admin e profissional): Chegou → Em atendimento ou Atendido, e Em atendimento → Atendido.
  - Agendado e Confirmado não vão direto a Atendido: a baixa de um Sem baixa atendido passa por Chegou, como na tabela.
  - A mudança só vale se o status ainda é o que a pessoa viu; senão, a tela pede para atualizar.
  - Motivo opcional no cancelamento e obrigatório na correção entre status finais (gestor e admin). Fica em `AppointmentStatusChange.reason`; a auditoria guarda só o nome do campo, "status" (D-28).
  - Remarcar: só de Agendado ou Confirmado, por quem marca. O agendamento novo mantém paciente, tipo, duração, valor, convênio, origem e observação interna; mudam data, hora e, se preciso, profissional e unidade. O valor não é recalculado para outro profissional: vale o combinado.
  - O histórico mostra o nome de quem mudou o status. Quem age sem alocação na conta só pode ser o admin da organização, e aparece assim.
- **Motivo:** D-10 e D-11, e uma regra única para telas, régua e integrações.
- **No PRD:** seção 4 (Agendamento, Transições de status, regra 6).

### D-45 · Busca e cadastro rápido de paciente

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - Busca por nome sem acento nem caixa: a coluna `Patient.searchName`, igual a `lower(unaccent(name))`, é mantida por um trigger do banco (extensão `unaccent`), para valer também na importação do Bloco 4, que grava pelo cliente base. Por celular: 4 dígitos ou mais contidos no número.
  - Até 8 resultados, com o último atendimento e o selo "Aceita WhatsApp" (leitura do consentimento mais recente). Paciente anonimizado (D-28) não aparece.
  - Cadastro rápido: nome, celular obrigatório com DDD (gravado em E.164) e convênio, com padrão Particular. Celular já cadastrado na conta dá erro com a opção de usar o paciente existente. O registro do consentimento continua no Bloco 4 (D-22).
  - Só quem marca (`appointments:manage`) busca e cadastra nesta tela.
  - O índice `(practiceId, searchName)` restringe a busca à conta. O tempo com 50 mil pacientes por conta (seção 7) ainda não foi medido; se passar de 500 ms, o próximo passo é um índice trigram (`pg_trgm`). Medido no Bloco 4, bem abaixo do limite (D-50).
- **Motivo:** nomes brasileiros têm acento, e "sergio" precisa achar "Sérgio". O celular obrigatório garante a deduplicação da D-18 e o contato da régua.
- **No PRD:** seção 4 (Agendamento), seção 12 (Bloco 3).

### D-46 · shadcn/ui e Playwright

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - shadcn/ui 4 com Radix (preset Nova), tema com as cores dos mockups em `src/app/globals.css` (primária #0F766E, fundo #F4F6F5). Componentes em `src/components/ui`. O `src/components/ui.tsx` do Bloco 2 virou `src/components/app-ui.tsx`, sem mudar o conteúdo, porque a pasta `ui` é do shadcn. Os selects são `<select>` nativos (`NativeSelect`), que postam em formulário sem JavaScript.
  - Playwright 1.64, só Chromium. `npm run test:e2e` faz o build de produção e sobe `next start` na porta 3100 contra o `agenda_test`, recriado por `e2e/prepare-database.ts` com os dados de `e2e/data.ts`. O `next dev` não roda duas vezes na mesma pasta, então o teste convive com o servidor de desenvolvimento.
  - O `test:e2e` fica fora do `npm run check`, porque precisa de build e navegador. Ele e o `npm test` usam o mesmo banco: não rode os dois ao mesmo tempo.
- **Motivo:** stack da seção 12. O build de produção é o que o guia do Next recomenda para o Playwright.
- **No PRD:** seção 12 (stack).

## Bloco 4 em 28/10/2026

Decisões tomadas no Bloco 4 (consentimento, importação por planilha, pedidos do titular e tela Pacientes).

### D-47 · Consentimento de contato

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - `ContactConsent` é um log só de inserção, como a trilha de auditoria (D-31): um trigger do banco recusa UPDATE, DELETE e TRUNCATE, e o cliente com escopo recusa update, delete e upsert (`APPEND_ONLY_MODELS`). A chave do paciente passou a `RESTRICT`: o paciente é pseudonimizado, nunca apagado (D-28), e o log sobrevive à exclusão.
  - Aceite, recusa e revogação são linhas novas com data, canal e quem registrou. O estado atual é a linha mais recente: "Aceita WhatsApp", "Não aceita" ou "Sem registro" (nenhuma linha). Só "Aceita WhatsApp" entra na régua do Bloco 5.
  - Canais manuais: Presencial, Telefone, WhatsApp e Formulário. Importação é só da importação por planilha.
  - O cadastro rápido do novo agendamento ganhou "Aceita receber lembretes pelo WhatsApp" e o canal. Sem marcar, nada é gravado.
  - Na tela do paciente, quem marca (`patients:consent`: secretária, gestor e admin) registra aceite, recusa ou revogação. Uma linha que não mudaria o estado é recusada, para o clique duplo não gravar duas vezes. Auditoria `contact_consent.recorded`, com os campos `granted` e `channel`.
  - A revogação pela resposta PARAR fica no Bloco 5, gravando uma linha `granted: false` com canal WhatsApp.
- **Motivo:** PRD 6, regra 1, e PRD 7 (consentimento registrado com data e canal). Com o log imutável, o histórico do consentimento serve de prova da base legal do WhatsApp (D-19).
- **No PRD:** seção 6 (regra 1), seção 7 (LGPD).

### D-48 · Importação por planilha

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - **Formato:** CSV com `;` (o do Excel no Brasil) ou `,`, detectado no cabeçalho; UTF-8, com ou sem BOM, ou Windows-1252, o "CSV" comum do Excel; aspas como na RFC 4180. O cabeçalho é lido sem acento nem caixa, com alguns apelidos (`telefone` vale `celular`, `plano` vale `convenio`); colunas a mais são ignoradas. Modelos em `public/modelos/pacientes.csv` e `public/modelos/agenda.csv`, com BOM e linhas fictícias; um teste confere o cabeçalho contra o código.
  - **Limites:** arquivo de até 900 KB, porque o corpo de uma Server Action é de 1 MB por padrão e o `next.config` não foi mudado; até 20 mil linhas de pacientes e 2 mil de agenda por arquivo.
  - **Quem:** gestor e admin (`patients:import`). A ativação da régua em lote usa `cadence:edit`, a coluna "Régua: Edita" da seção 3.
  - **Pacientes:** colunas `nome` e `celular` obrigatórias; `convenio`, `observacoes` e `consentimento_whatsapp` (sim, não ou vazio). A deduplicação usa o celular normalizado (`normalizePhone`) dentro da conta. Celular já cadastrado conta como "existente" e nada do paciente muda, nem o consentimento: um "sim" da planilha não pode desfazer uma revogação. Celular repetido na própria planilha é erro na linha (vale a primeira). Paciente excluído não tem celular e não casa. Os novos entram em lotes de 500, cada lote numa transação com o consentimento (canal Importação, só de quem a planilha diz sim ou não) e a auditoria `patient.imported`.
  - **Agenda:** colunas `data`, `hora`, `profissional`, `tipo`, `paciente` e `celular` obrigatórias; `unidade` (dispensável quando o profissional atende em uma só), `convenio`, `status`, `duracao`, `valor`, `observacao` e `origem`. Profissional, unidade e tipo são casados pelo nome, sem acento nem caixa, entre os ativos. Status aceitos: Agendado (padrão), Confirmado, Atendido, Faltou, Cancelado pelo paciente e Cancelado pelo consultório; futuro não pode estar Atendido nem Faltou. Chegou, Em atendimento e Reagendado não são importáveis.
  - **Ordem:** primeiro todas as linhas são lidas; depois os pacientes das linhas válidas são achados ou criados pelo celular (nome e convênio da primeira linha daquele celular); por fim, cada linha vira um agendamento por `importAppointment`, na ordem do arquivo, numa transação serializável própria. Um conflito, com a agenda ou com uma linha anterior, derruba só aquela linha. Paciente criado para uma linha que depois conflita fica cadastrado.
  - **Agendamento importado:** as mesmas checagens de um agendamento novo (D-12, D-43), sem encaixe; status que não ocupa horário (Faltou, cancelamentos) não checa conflito. Entra com `cadenceEnabled: false`, histórico de criação com origem `IMPORT` e auditoria `appointment.imported`. O status da planilha é aplicado por `changeAppointmentStatus` com `source: "IMPORT"`, dentro da mesma transação: o ator de importação de `checkTransition` vai de Agendado direto a qualquer status importável, e só vale para quem tem `patients:import` num agendamento cujo único histórico é a própria importação. O mesmo profissional, paciente e início já na agenda conta como "existente", então reenviar a planilha não duplica.
  - **Relatório:** volta na resposta e não é guardado, porque teria dado pessoal. A tela mostra o resumo e as linhas com erro, e baixa um CSV com as colunas da planilha mais `linha` e `erro`, que pode ser corrigido e reenviado.
  - **Régua em lote:** a tela de importação lista, por profissional, os agendamentos futuros em Agendado ou Confirmado com a régua desligada, e o gestor liga por profissional ou todos. Auditoria `appointment.cadence_enabled` por agendamento. Passados e cancelados ficam desligados. O Bloco 5 agenda os disparos de quem tiver a régua ligada depois da criação.
  - **Google:** a exportação dos agendamentos futuros importados para o Google Agenda (D-18) fica com a primeira sincronização do Bloco 6 (PRD 5, regra 7). Feita no Bloco 6: na importação, quando o profissional já tem Google, ou na primeira sincronização (D-62).
- **Medição:** a planilha de 500 linhas do teste (`agenda-import.test.ts`) importa em cerca de 7 s no ambiente local.
- **Motivo:** D-18 e o critério de pronto do Bloco 4. A transação por linha mantém a regra de conflito da D-43 e deixa o resto da planilha seguir.
- **No PRD:** seção 4 (regra 9), seção 12 (Bloco 4).

### D-49 · Exportação e exclusão a pedido do titular

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - **Quem:** gestor e admin (`patients:data-requests`), na tela do paciente. O prazo de 15 dias do PRD 7 é do processo, não do sistema.
  - **Exportação:** um arquivo JSON, gerado no servidor e salvo pelo navegador, com chaves em português: conta, paciente (nome, celular, convênio, observações, datas), consentimentos (data, situação, canal) e todos os agendamentos da conta (data e hora no fuso da unidade, unidade e endereço, profissional, tipo e categoria, status, duração, valor, convênio, origem, observação interna, histórico de status com origem e motivo, e mensagens da régua com texto e resposta). A observação interna entra: o direito de acesso cobre todo dado pessoal, e o "não vai para o paciente" da seção 4 trata de mensagens e do Google. Os nomes de quem mudou status ficam de fora, porque são dado da equipe. Auditoria `patient.exported`.
  - **Exclusão (D-28):** pede que se digite EXCLUIR. É recusada enquanto houver agendamento em aberto (Agendado, Confirmado, Chegou ou Em atendimento, inclusive Sem baixa), porque a recepção não saberia quem espera. O paciente vira "Paciente excluído", sem celular, convênio e observações, com `anonymizedAt`. Os agendamentos ficam, com valor, status e datas, mas perdem convênio e observação interna. Os motivos do histórico de status e o texto e a resposta das mensagens desses agendamentos viram nulos, porque são texto livre que pode ter dado de saúde. Consentimentos e trilha de auditoria não mudam. Um evento `patient.anonymized` lista os nomes dos campos limpos. O celular fica livre para um cadastro novo da mesma pessoa.
  - **Pendência do Bloco 6:** os eventos do paciente no Google Agenda precisam perder o primeiro nome do título. O Bloco 6 acha os agendamentos com `googleEventId` de pacientes com `anonymizedAt` (ou pelos eventos `patient.anonymized`) e regrava o título. Feita no Bloco 6: a exclusão marca esses agendamentos para exportar, e o job diário confere os que ficaram para trás (D-62).
- **Motivo:** PRD 7 (LGPD) e D-28.
- **No PRD:** seção 7 (LGPD), seção 9 (Dentro do MVP).

### D-50 · Tela Pacientes, permissões e desempenho da busca

- **Status:** Decidida em 28/10/2026.
- **Decisão:**
  - **Permissões novas** (`src/lib/auth/permissions.ts`): `patients:view` e `patients:consent` para secretária, gestor e admin; `patients:import` e `patients:data-requests` para gestor e admin. O profissional não abre Pacientes: a tela mostra os agendamentos do paciente com qualquer profissional, e ele vê só a própria agenda.
  - **Lista:** `/conta/[id]/pacientes?busca=&pagina=`, 50 por página, por nome, sem os excluídos, com celular, convênio, consentimento atual, último atendimento e próximo agendamento em aberto. A busca é a mesma do novo agendamento (`patientSearchWhere`, D-45).
  - **Paciente:** `/conta/[id]/pacientes/[pacienteId]` mostra os dados, todos os agendamentos dele na conta, do mais recente ao mais antigo, com link para cada um (PRD 4, regra 7), o consentimento com o log e, para gestor e admin, exportação e exclusão. Paciente excluído abre com os agendamentos e sem dado pessoal. O detalhe do agendamento ganhou o link para o paciente e mostra quando a régua está desligada.
  - **Importação:** `/conta/[id]/pacientes/importar`, para gestor e admin, com os dois modelos, os relatórios e a ativação da régua em lote (D-48).
  - Edição do cadastro do paciente (nome, celular, convênio, observações) ainda não existe; fica como próximo passo.
- **Medição (PRD 7, menos de 500 ms com 50 mil pacientes por conta):** `npm run bench:search` recria o `agenda_test` com duas contas de 50 mil pacientes, 20 mil agendamentos e 30 mil consentimentos cada, e mede pelo cliente com escopo, como as telas chamam. Resultado em 28/10/2026, Postgres 17 no Docker Desktop, 30 execuções de cada:

  | Consulta | p50 | p95 |
  | --- | --- | --- |
  | Busca "maria" (nome comum) | 18 ms | 23 ms |
  | Busca "sergio" (sem acento) | 27 ms | 35 ms |
  | Busca "zzq" (sem resultado, varre a conta) | 15 ms | 17 ms |
  | Busca "4455" (dígitos do celular) | 18 ms | 20 ms |
  | Lista, página 1 | 16 ms | 22 ms |
  | Lista, última página (1.000) | 60 ms | 93 ms |
  | Lista "silva" | 24 ms | 34 ms |

  Com duas contas o Postgres prefere varrer a tabela (13 ms para 100 mil linhas). Forçando o índice da conta, como acontece quando a tabela tem muitas contas, a busca sem resultado lê as 50 mil linhas da conta em 33 ms. O índice trigram (`pg_trgm`) não foi necessário.
- **Motivo:** PRD 11 (tela Pacientes), PRD 4 (regra 7) e PRD 7 (Desempenho).
- **No PRD:** seção 4 (regra 7), seção 7 (Desempenho), seção 11 (Telas sem mockup).

## Bloco 5 em 29/10/2026

Decisões tomadas no Bloco 5 (régua de WhatsApp, motor de disparos, WhatsAPI, webhook de resposta, log e lista Sem confirmação).

### D-51 · WhatsAPI, provedor de mensagens e webhook

- **Status:** Decidida em 29/10/2026.
- **Decisão:**
  - **A WhatsAPI é revenda da uazapi.** O site da WhatsAPI não publica a documentação da API; o painel dela aponta para docs.uazapi.com (OpenAPI "uazapiGO" 2.6.9). Cada instância tem servidor e token próprios, e o token vai no header `token`. O cliente (`src/lib/messaging/whatsapi.ts`) usa `POST /send/text` (`number`, `text`, `track_source`, `track_id` com o id do disparo), `GET /instance/status` e `POST /webhook`. O id guardado no disparo é o `messageid`, o mesmo que os recibos trazem.
  - **Interface `MessagingProvider`** (`src/lib/messaging`), com dois provedores. O sandbox grava cada mensagem na tabela `SandboxMessage`, por conta e com o trigger de imutabilidade da D-30; é o padrão fora de produção e nos testes. O `whatsapi` envia de verdade, e produção sempre usa ele. Fora de produção, o envio real só alcança os números de `MESSAGING_ALLOWED_NUMBERS`, para uma instância de teste nunca escrever a um paciente da demo. A exclusão do titular limpa número e texto da `SandboxMessage` (D-49).
  - **Erros do provedor:** 401, `instance_not_paired`/`instance_not_connected` ou texto de desconexão contam como instância desconectada; 429, 5xx e falha de rede, como transitórios; o resto, como mensagem recusada.
  - **Token da instância criptografado** com AES-256-GCM e `TOKEN_ENCRYPTION_KEY` (`src/lib/crypto/secrets.ts`, que o Bloco 6 reaproveita para o Google).
  - **Webhook:** uma URL por instância, `/api/webhooks/whatsapi/[instanceId]`. A uazapi manda o token da instância no corpo de cada evento; a rota só aceita se ele bater com o token guardado, em comparação de tempo constante. Eventos assinados: `messages`, `messages_update` e `connection`, com o filtro `isGroupYes`. O filtro `wasSentByApi`, que a uazapi recomenda contra laços, ficou de fora porque também esconderia os recibos das mensagens da régua; o sistema não responde automaticamente, e as mensagens próprias (`fromMe`) são ignoradas.
  - **O webhook da agenda é acrescentado, nunca substitui outro.** A mesma instância pode servir outros sistemas (a de teste já tinha o webhook de outro sistema), então `configureWebhook` lista os webhooks da instância e só atualiza o que tem o caminho da agenda; senão, acrescenta um novo (`action: "add"`).
  - **O evento é tratado dentro da requisição**, e não numa fila: cada um custa poucas consultas e a resposta "1" muda o status antes de o webhook responder (critério de pronto: até 10 s). Se o banco falhar, a rota devolve 500.
  - Scripts de desenvolvimento: `npm run whatsapi:setup` registra uma instância de teste para um profissional do banco de desenvolvimento e aponta o webhook para o túnel (`PUBLIC_WEBHOOK_URL`); `npm run whatsapi:reply` simula a resposta de um paciente para o webhook local.
- **Motivo:** PRD 6 (Canal) e 10 (camada de envio isolada), PRD 12 (provedor falso que grava em tabela) e D-05 (respostas só pelo webhook da WhatsAPI).
- **No PRD:** seção 6 (Canal), seção 12 (stack e Bloco 5).

### D-52 · Quando cada passo sai

- **Status:** Decidida em 29/10/2026.
- **Decisão** (`src/lib/cadence/schedule.ts`, função pura usada pelo plano e pela prévia):
  - Horário nominal: "ao agendar" é o momento em que a régua começa para o agendamento, que é o próprio agendamento ou, para importado, a ativação em lote pelo gestor (o "ao agendar" sai nessa hora, dentro da janela). Passo ancorado no atendimento é o início mais o deslocamento, com o horário fixo aplicado no dia local da unidade.
  - Passo cujo nominal já passou quando a régua começa é pulado e fica no log.
  - A janela vale no fuso da unidade, e o fim é um horário válido ("8h às 20h" inclui 20h). Passo antes do atendimento fora da janela é antecipado para o último horário válido; se esse já passou, é adiado para o próximo, desde que fique a margem antes do atendimento; senão é pulado. "Ao agendar" só é adiado, também com a margem. A margem só vale para horário movido para depois: um "ao agendar" dentro da janela sai na hora, mesmo perto do atendimento.
  - Limite de 4 h entre mensagens automáticas do mesmo paciente, em qualquer agendamento da conta: no plano, cada passo se afasta dos outros passos e dos disparos já agendados ou enviados; no envio, o limite é conferido de novo contra o que saiu de fato. O passo barrado vai para o fim do intervalo, com a janela (só adiar) e a margem; se não couber, é pulado. Disparo manual não conta nem é barrado.
  - O ajuste fica anotado no disparo (antecipada, adiada, adiada pelo limite de 4 h) e aparece no log e na prévia.
  - Exemplo do mockup, com janela de 8h às 20h de segunda a sábado: para a terça às 10h, o D-2 de domingo vai para sábado às 20h e o H-3 (7h, antecipado para segunda às 20h, a 2 h do D-1 das 18h) vai para terça às 8h.
- **Motivo:** D-07 deixava em aberto o fim da janela, a margem do "ao agendar", o "ao agendar" dos importados e onde conferir o limite de 4 h.
- **No PRD:** seção 6 (Janela de envio, regra 5).

### D-53 · Plano, parada e versões da régua

- **Status:** Decidida em 29/10/2026.
- **Decisão** (`src/lib/cadence/plan.ts`):
  - Os disparos são criados na mesma transação do agendamento, da remarcação (no agendamento novo) e da ativação em lote dos importados. Entram só agendamentos futuros, Agendados ou Confirmados, com a régua ligada, consentimento "granted" (D-47) e régua ativa do tipo que cubra o profissional (lista vazia = todos). Cada passo vira um disparo agendado, ou pulado com o motivo. O plano trabalha em lote, com um número fixo de consultas: a ativação de 2 mil importados cabe numa transação.
  - Profissional sem instância: o disparo nasce sem instância, recebe a do profissional quando vencer e, se ainda não houver, falha com "profissional sem WhatsApp conectado".
  - Toda mudança de status, dentro da transação dela, cancela o que deixou de valer: a confirmação encerra os pedidos de confirmação (D-06), e qualquer status encerra os passos para os quais não é elegível. Assim, cancelamento e remarcação encerram a régua inteira, e o lembrete só para Agendado não sai depois da confirmação. A mudança de status também resolve os marcadores abertos pela régua.
  - Versões: mudar os passos cria a versão nova (`CadenceStep.cadenceVersion`), e os passos antigos ficam para o log. Os disparos agendados para as próximas 24 h ficam como estavam, com o texto da versão deles; os seguintes são cancelados ("régua alterada") e os passos da versão nova são planejados só depois dessas 24 h. Ativar ou desativar a régua, mudar tipos ou profissionais, trocar a régua de um tipo e mudar a janela replanejam do mesmo jeito, sem versão nova.
  - Consentimento revogado (manual ou PARAR) cancela os disparos agendados do paciente; concedido planeja os agendamentos futuros dele.
- **Motivo:** PRD 6 (regras 1, 2 e 7, Parada), D-06, D-11, D-18 e D-47.
- **No PRD:** seção 6 (Parada, regras 1, 2 e 7).

### D-54 · Fila de envio no Inngest e instância desconectada

- **Status:** Decidida em 29/10/2026.
- **Decisão:**
  - `inngest` fixado em 4.26.1 (D-33). Três funções finas em `src/lib/inngest/functions.ts`: um tick por minuto acha as instâncias com disparos vencidos e manda um evento de drenagem para cada uma; a drenagem roda uma por instância (`concurrency` com chave na instância), envia um disparo de cada vez com 8 s entre eles e para em 8 envios, deixando o resto para o próximo tick; a cada 5 min, a conexão de cada instância é conferida no provedor. O disparo manual pede uma drenagem na hora. Em desenvolvimento, `npm run inngest:dev` sobe o servidor local do Inngest, sem conta (`INNGEST_DEV=1`). As regras ficam em `src/lib/cadence/sender.ts`, testadas sem o Inngest.
  - Antes de enviar, tudo é conferido de novo: atendimento ainda no futuro, status elegível para o passo, régua ligada, consentimento, régua pausada, limite de 4 h. Uma trava de 2 min (`lockedUntil`) impede dois envios do mesmo disparo. Erro transitório é tentado de novo um minuto depois, até 3 tentativas; mensagem recusada falha na hora.
  - "Sem confirmação": quando não sobra pedido de confirmação na fila, por ter sido enviado, pulado ou falhado, e o agendamento segue Agendado sem nenhuma resposta, ele recebe o marcador e entra na lista.
  - O `npm audit` aponta o zod 3 que o `inngest` 4 traz como dependência própria (GHSA-mrhx-c7xc-m3w5: memória ao validar coleções enormes). O `inngest` usa esse zod só para validar o que o próprio Inngest manda à rota `/api/inngest`, assinada em produção, e nenhuma versão 4.x dispensa o zod 3. Fica aceito até o `inngest` atualizar; o resto do app usa o zod 4 do Better Auth.
  - D-09: com a instância fora de "conectada", a fila espera. Na reconexão, pelo webhook `connection` ou pela checagem de 5 min, os disparos vencidos há 2 h ou mais, ou de atendimento que já passou, falham com "instância desconectada"; os outros saem. Na instância conectada, um disparo com 2 h de atraso falha como "atrasada". Ao sair de "conectada", o gestor da conta e o usuário do profissional recebem e-mail pelo `EmailSender` (D-38).
- **Motivo:** PRD 6 (regras 5 e 8), PRD 12 (Inngest), D-07 e D-09.
- **No PRD:** seção 6 (regras 5 e 8), seção 12 (stack).

### D-55 · Respostas do paciente

- **Status:** Decidida em 29/10/2026.
- **Decisão** (`src/lib/cadence/replies.ts`):
  - O paciente é achado pelo número do WhatsApp entre os pacientes da conta da instância, tentando o número com e sem o 9 depois do DDD: celulares antigos ainda chegam com 8 dígitos. Mensagens próprias (`fromMe`), de grupo e de id sem número (`@lid`) são ignoradas.
  - Normalização da D-08: minúsculas, sem acento, sem espaços, pontuação e símbolos nas pontas. "PARAR" é a quinta resposta exata.
  - Alvo: a última mensagem de régua, automática ou manual, que aquela instância enviou àquele paciente. Se o atendimento dela já passou, a resposta não vale para nenhum agendamento, nem para um mais antigo. A resposta fica gravada nessa mensagem, que passa a "lida".
  - "1": de Agendado vai para Confirmado por `changeAppointmentStatus` com o ator `cadence` (`CadenceActor`) e a origem `CADENCE_REPLY`, sem usuário; a auditoria registra o ator PATIENT. "3": de Agendado ou Confirmado vai para Cancelado pelo paciente. "2": só o marcador Pediu remarcação. Texto livre ou mídia com o agendamento Agendado: marcador Respondeu sem confirmar, que pausa a régua; os passos que vencem durante a pausa são pulados, e a secretária retoma a régua ou confirma. Com o agendamento já Confirmado, o texto livre só fica registrado.
  - "PARAR": linha nova `granted: false`, canal WhatsApp, sem usuário, e os disparos agendados do paciente são cancelados. PARAR repetido não grava outra linha.
- **Motivo:** PRD 6 (Respostas e ações, Leitura da resposta, regra 1), D-05, D-06, D-08 e D-47.
- **No PRD:** seção 6 (Respostas e ações, Leitura da resposta).

### D-56 · Telas da régua, log de disparos e Sem confirmação

- **Status:** Decidida em 29/10/2026.
- **Decisão:**
  - **Régua de WhatsApp** (`/conta/[id]/regua`, `cadence:edit`), no layout do mockup: lista de réguas com "Nova régua", canais da conta (instância de cada profissional e há quanto tempo está desconectada), editor e prévia.
    - **Aplica a:** escolhe tipos; como o tipo tem uma régua só, escolher aqui tira o tipo da régua anterior. Profissionais: nenhum marcado vale para todos.
    - **Passos:** de 1 a 4 (MVP). Quando: ao agendar, de 1 a 30 dias antes com horário, ou de 1 a 72 horas antes. Status elegível: Só Agendado ou Agendado e Confirmado; pedido de confirmação é sempre Só Agendado. Variável fora da lista da seção 6, como `{link_reagendar}` (fase 2), é recusada com o passo e a variável nomeados.
    - **Janela de envio e margem** da conta ficam num formulário à parte na mesma tela (`practice-settings:edit`), já que valem para todas as réguas.
    - **Prévia:** atendimento na próxima terça às 10h, marcado agora, no fuso da agenda.
    - **Fora desta tela:** "Parar ao confirmar ou cancelar", que o mockup mostra como opção, virou regra fixa (D-06). Também ficaram de fora "Enviar teste para mim", porque usuário não tem celular cadastrado, e "Reconectar por QR Code": a instância é conectada no painel da WhatsAPI, e o QR Code dentro do sistema fica para a tela Perfil do profissional (D-23).
  - **Log no detalhe do agendamento** (`dispatch-log:view`, ou `-own` para o profissional): cada mensagem com passo, versão, horário previsto ou de envio, situação, motivo, texto e resposta. Mostra também a situação da régua: ativa, desligada, sem consentimento, sem régua, sem instância, pausada ou encerrada. Ações:
    - "Enviar agora" um passo (`dispatch:manual`): fora do limite de 4 h, mas com consentimento e instância;
    - "Registrar contato manual" (`appointments:manage`): encerra os pedidos de confirmação e fecha os marcadores Sem confirmação e Respondeu sem confirmar (D-06);
    - "Retomar régua".
  - **Sem confirmação** (`/conta/[id]/sem-confirmacao`, `agenda:view`, no menu depois da Agenda): agendamentos futuros com o marcador aberto, em três listas. Sem confirmação tem Confirmar e Contato manual; Pediu remarcação tem Contato manual; Respondeu sem confirmar tem a resposta, Confirmar e Retomar régua.
- **Motivo:** PRD 6 e 11 (tela Régua de WhatsApp, Log de disparos, Listas de trabalho) e D-23.
- **No PRD:** seção 6 (Estrutura da régua, regras 3, 4 e 6), seção 11.

### D-57 · Teste com a WhatsAPI real

- **Status:** Decidida em 29/10/2026.
- **Como foi:** instância de teste da WhatsAPI, de Felipe Guedes e não de um profissional, registrada para a Dra. Marina Castro no banco de desenvolvimento. Envio real ligado só para o celular de teste (`MESSAGING_ALLOWED_NUMBERS`). Túnel `cloudflared` aberto pelo usuário, porque o modo automático do agente bloqueia abrir túnel de entrada. A instância já tinha o webhook de outro sistema; o da agenda entrou como segundo webhook e foi removido no fim, com o outro intacto.
- **Resultado:**
  - Um agendamento marcado pelo serviço planejou a régua (ao agendar, D-1 às 18h, H-3 adiado para as 8h pelo limite de 4 h). O lembrete "ao agendar" e um pedido de confirmação manual saíram pela API e chegaram ao celular; o recibo "Delivered" voltou pelo webhook e marcou a mensagem como Entregue.
  - A resposta "1" enviada pelo celular às 14:04:31 confirmou o agendamento às 14:04:33,256 (cerca de 2,3 s, dentro dos 10 s do critério), com origem `CADENCE_REPLY`. Os pedidos de confirmação ainda agendados foram cancelados com o motivo "paciente confirmou".
  - O WhatsApp entregou o número com o nono dígito, no formato `55DD9XXXXXXXX@s.whatsapp.net`.
  - As mensagens da régua apareceram na conversa da SynkronosCRM, onde o número da instância de teste também está conectado, conforme conferido por Felipe Guedes. Isso confirma a D-05: a régua sai pela WhatsAPI e a secretária vê as mensagens na Synkronos.
- **Observações:**
  - O Docker Desktop derrubou a porta do Postgres duas vezes durante a sessão, e o `next dev` ficou com conexões mortas (`P1017`, ECONNRESET) até o container ser reiniciado. Em produção o banco é outro; localmente, `docker restart agenda-postgres` resolve.
  - O texto do pedido D-1 da demo diz "amanhã". No disparo manual, fora do dia previsto, a mensagem saiu com "amanhã" para um atendimento dali a 5 dias. Textos com `{data_extenso}` no lugar de "amanhã" servem para os dois casos.

## Bloco 6 em 29/10/2026

Decisões tomadas no Bloco 6 (Google Agenda de mão dupla: vínculo, calendário secundário, exportação, bloqueios, pendências).

### D-58 · Provedor do Google, sandbox e googleapis

- **Status:** Decidida em 29/10/2026.
- **Decisão:**
  - **Interface `GoogleCalendarProvider`** (`src/lib/google/provider.ts`), no padrão do `MessagingProvider` (D-51): OAuth (URL de consentimento, troca do código, renovação, revogação) e agenda (listar calendários, criar e apagar o secundário, ler eventos numa janela, ler, criar, alterar e apagar um evento, abrir e fechar canal de push). Os erros saem como `GoogleError` com um tipo: `auth` (acesso revogado ou vencido), `not_found`, `conflict`, `transient` (429, 5xx, limites de cota, rede) e `rejected`. A sincronização nunca olha detalhe de HTTP.
  - **Real:** `src/lib/google/client.ts`, com `googleapis` fixado em 186.0.0 (lançado em 14/10/2026; o 188 tinha uma semana). Só o módulo do Calendar é importado (`googleapis/build/src/apis/calendar/index.js`): o pacote inteiro leva 5,4 s para carregar, o Calendar 0,35 s. O `next.config.ts` deixa o `googleapis` fora do bundle (`serverExternalPackages`), porque o pacote tem 246 MB. O cliente OAuth é o mesmo do login com Google (`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`), com outro redirect: `/api/google/oauth/callback`.
  - **Sandbox:** `src/lib/google/sandbox.ts` guarda calendários e eventos de contas Google falsas nas tabelas `SandboxGoogleCalendar` e `SandboxGoogleEvent`, fora das contas, como o `GoogleConnection`. É o padrão fora de produção (`GOOGLE_CALENDAR_PROVIDER="sandbox"`); produção sempre usa o Google. Com tabela, o servidor, os testes, o e2e e o `npm run google:sandbox` (que faz o papel do profissional no Google: criar, mover e apagar eventos, e sincronizar na hora) enxergam o mesmo "Google". O consentimento falso fica em `/google/sandbox`, que responde 404 com o Google de verdade. O "updated" do evento sempre avança, como no Google. Fora de produção, um vínculo do sandbox continua no sandbox mesmo com o Google de verdade ligado (`googleProviderFor`), para um teste real não revogar os vínculos falsos da demo.
  - **Contas permitidas:** fora de produção, o Google de verdade só vincula as contas de `GOOGLE_ALLOWED_ACCOUNTS`, como o `MESSAGING_ALLOWED_NUMBERS` da D-51. A agenda real de um profissional nunca entra num ambiente de teste.
  - O `npm audit` não mudou com o `googleapis` (seguem o zod 3 do `inngest`, D-54, e o deepmerge do `shadcn`).
- **Motivo:** PRD 12 (googleapis com watch e polling; sandbox dos provedores) e a regra da sessão de nunca usar a agenda real de um profissional.
- **No PRD:** seção 12 (stack).

### D-59 · Vínculo OAuth do profissional

- **Status:** Decidida em 29/10/2026.
- **Decisão** (`src/lib/google/link.ts`, rotas `/api/google/oauth/start` e `/callback`):
  - **Escopos mínimos**, conferidos na documentação do Google em 29/10/2026: `openid email` (quem é a conta), `calendar.app.created` (criar o calendário secundário e mexer só nos eventos dele), `calendar.calendarlist.readonly` (a lista para a escolha do ocupado) e `calendar.events.readonly` (ler os eventos dos outros calendários). Nada do escopo amplo `calendar`, que deixaria o app apagar calendários e eventos pessoais. `access_type=offline` e `prompt=consent`, para cada vínculo trazer um refresh token; sem `include_granted_scopes`, como no login (D-35). PKCE (S256) e `state` num cookie httpOnly, criptografado e de 10 minutos, lido só pelo callback. Na tela granular do Google o profissional pode desmarcar acessos: faltou um escopo de agenda, o vínculo é recusado com aviso e o que o Google deu é revogado.
  - **Pedido de vínculo** (`GoogleLinkRequest`, por conta): o gestor envia por e-mail (`EmailSender`, D-38) um link `/google/vincular/[token]` com token de 32 bytes, SHA-256 no banco, 7 dias e uso único, como o convite. O link abre sem login: quem autoriza é o dono da conta Google, que entra com ela na tela do Google. O e-mail é o do login do profissional ou um que o gestor digita, para quem ainda não tem login. O profissional logado usa o mesmo caminho, com um pedido de 30 minutos criado pelo botão "Vincular Google Agenda" do perfil.
  - **Tokens só criptografados** (`encryptSecret`, D-51): o refresh token e também o access token, guardado com a validade para não renovar a cada leitura. `invalid_grant` na renovação marca o vínculo como REVOKED (com data e motivo), e a agenda segue sem o Google (PRD 5, regra 6). Um 401 numa chamada só descarta o access token: a próxima chamada renova ou descobre a revogação.
  - **Um vínculo por conta Google** (`googleSubject`), compartilhado pelos profissionais da mesma pessoa em várias contas (D-04). Vincular outra conta Google move o profissional: os dados da conta antiga daquela clínica saem (bloqueios, calendário secundário, apagado também no Google) e o vínculo antigo é revogado e apagado se ninguém mais o usa.
  - **Desvincular** (perfil, profissional ou gestor): apaga os bloqueios do Google, o calendário secundário (também no Google, já que o app o criou: os primeiros nomes dos pacientes saem da conta do profissional), fecha as pendências e, sem outro profissional no vínculo, para os canais, revoga o token e apaga o vínculo.
  - Auditoria: `google_link.sent`, `professional.google_linked` e `professional.google_unlinked`, com o campo `googleConnectionId`.
- **Motivo:** PRD 5 (Vínculo), D-01, D-04, D-24 e a revisão da Google, que prefere o menor escopo.
- **No PRD:** seção 5 (Vínculo, regra 6).

### D-60 · O que vira bloqueio

- **Status:** Decidida em 29/10/2026.
- **Decisão** (`src/lib/google/rules.ts`, função pura):
  - **Calendários que contam:** enquanto o profissional não escolhe, todos em que ele pode escrever (owner ou writer), menos o secundário da própria conta; um calendário novo entra sozinho na sincronização seguinte. Escolhendo no perfil, vale a lista dele, inclusive calendários só de leitura (a escala do hospital, por exemplo), e "Voltar ao padrão" desfaz. O secundário de outra conta do mesmo profissional conta (D-15). A escolha fica em `Professional.googleBusyCalendarIds` e `googleBusyCalendarsChosen`; os nomes dos calendários aparecem só para o profissional, porque são dado pessoal dele.
  - **Eventos:** ocupado bloqueia; livre não, exceto o de dia inteiro enquanto a regra do perfil estiver ligada (padrão, D-15). Não bloqueiam: cancelado, convite recusado pelo profissional, local de trabalho (`workingLocation`) e aniversário (`birthday`). "Fora do escritório" e "Tempo de foco" bloqueiam. Dia inteiro vira bloqueio de 00:00 a 00:00 no fuso da agenda (D-41).
  - **Conteúdo:** o bloqueio guarda calendário, id do evento e horário. Título, descrição, local e participantes não são copiados; a agenda mostra "Compromisso Google".
- **Motivo:** PRD 5 (regras 1 e 2) e D-15.
- **No PRD:** seção 5 (regras 1 e 2).

### D-61 · Leitura do Google: janela, push e polling

- **Status:** Decidida em 29/10/2026.
- **Decisão** (`src/lib/google/inbound.ts` e `jobs.ts`):
  - **Janela em vez de sync token:** cada leitura de um calendário pede os eventos de agora até 90 dias à frente, com os recorrentes expandidos, e reconcilia: cria, move e apaga bloqueios. A janela anda a cada leitura, então um evento que sai dela, para o passado ou para depois dos 90 dias, perde o bloqueio como um apagado, e o job diário da D-15 não precisa varrer nada à parte. O sync token do Google não aceita `timeMin`/`timeMax` nas leituras seguintes, e a combinação com a janela tinha casos sem documentação; fica como otimização futura, se a cota pedir.
  - **Push:** cada calendário lido ganha um canal (`events.watch`) de 7 dias para `PUBLIC_WEBHOOK_URL/api/webhooks/google`, renovado pelo job diário quando faltam menos de 2 dias. A rota confere o canal e o token do canal (SHA-256 no banco, comparação em tempo constante), responde na hora e pede a leitura ao Inngest, com debounce de 5 s por calendário. A primeira mensagem do canal (`sync`) não lê nada. Sem URL HTTPS pública, não há push.
  - **Polling:** a cada 4 minutos, cada vínculo ativo é sincronizado; calendários lidos nos últimos 3 minutos (por um push) ficam de fora. Com 5 minutos, como dizia o PRD, o pior caso sem push seria o intervalo mais o tempo da leitura, acima do critério; o teste real mostrou isso (D-65). Cada sincronização também atualiza a lista de calendários, para um calendário novo contar já na leitura seguinte (D-60).
  - **Inngest** (D-54): exportação por evento e por tick de 1 minuto, leitura por push, sincronização por vínculo (que também cria o secundário que faltar e abre os canais) e o diário, às 3h de Fortaleza (lista de calendários, canais, eventos de anonimizados, leitura completa). As execuções de um mesmo vínculo nunca se sobrepõem (concorrência com escopo de ambiente na chave do vínculo). As regras ficam em `src/lib/google` e são testadas sem o Inngest.
- **Motivo:** PRD 5 (Fluxo de dados, regra 7), PRD 7 (Sincronização) e D-15.
- **No PRD:** seção 5 (Fluxo de dados, regra 7).

### D-62 · Exportação para o calendário secundário

- **Status:** Decidida em 29/10/2026.
- **Decisão** (`src/lib/google/outbound.ts` e `queue.ts`):
  - **Calendário:** um por profissional em cada conta, com o nome da conta e o fuso da agenda, criado na primeira sincronização depois do vínculo. Se o profissional apagar o calendário no Google, a exportação percebe, esquece o calendário e a sincronização seguinte cria outro e exporta os futuros.
  - **Evento:** título "Carlos · Procedimento (Agendado)": primeiro nome, nome exibido do tipo (D-14) e status, como a prévia do mockup do novo agendamento. Paciente excluído sai sem nome (D-28). Local: o endereço da unidade. Descrição: um aviso de que mudanças feitas ali ficam pendentes e o link do agendamento no sistema; observação interna, telefone e convênio nunca vão. Sempre ocupado, sem lembretes próprios (valem os do calendário). O id do evento é o UUID do agendamento sem hífens, que cabe no alfabeto do Google: um insert repetido depois de uma queda vira patch, nunca duplica. O Google guarda o id de um evento apagado; no teste real, o patch restaurou o evento com o mesmo id (D-65); se o Google não deixar, o evento volta com um id novo. O id do agendamento vai também em `extendedProperties.private`.
  - **O que vai:** os agendamentos futuros que ocupam horário ou foram fechados. Cancelado e Reagendado apagam o evento (o horário libera no Google); Atendido e Faltou só mudam o título. Agendamento já passado não é exportado, só atualizado se já tinha evento. Na criação do secundário, todos os futuros do profissional são exportados, os importados inclusive: a pendência da D-18 e da D-48 está resolvida.
  - **Fila:** `Appointment.googleSyncRequestedAt`, marcado na mesma transação de quem agenda, muda o status, remarca, importa, exclui o titular ou resolve uma pendência, só quando o profissional tem secundário. Depois do commit, `requestGoogleSync` manda um evento ao Inngest (PRD 7: no Google em até 30 s); a importação manda um só, no fim da planilha. A limpeza da marca é condicional ao valor lido, então uma mudança durante a exportação é exportada em seguida. `googleEventUpdatedAt` guarda o "updated" do evento depois da nossa escrita (D-63).
  - **Falhas:** vínculo revogado deixa as marcas para quando o profissional vincular de novo; erro transitório tenta de novo no tick seguinte, até 5 vezes; o resto fica em `googleSyncError` e aparece no detalhe do agendamento e no perfil, para o indicador de falhas de sincronização (PRD 8).
  - **Exclusão do titular (D-28, D-49):** `erasePatient` marca os agendamentos do paciente que têm evento, e a exportação regrava o título sem o nome. O job diário marca de novo os eventos de anonimizados sincronizados antes da exclusão, como rede de segurança. A pendência da D-49 está resolvida.
- **Motivo:** PRD 5 (Fluxo de dados, regras 5 e 7), PRD 7 (Sincronização), D-14, D-18 e D-28.
- **No PRD:** seção 4 (regra 9), seção 5 (Fluxo de dados, regra 5), seção 7 (LGPD).

### D-63 · Pendências e conflitos

- **Status:** Decidida em 29/10/2026.
- **Decisão** (`src/lib/google/inbound.ts` e `changes.ts`):
  - **Detecção:** ao ler o secundário da própria conta, cada agendamento Agendado ou Confirmado, futuro e sem exportação pendente é comparado com o seu evento. Horário diferente vira pendência MOVED com o horário e a duração propostos; evento apagado vira DELETED. Só conta mudança com "updated" posterior à nossa última escrita, para o eco do próprio patch não virar pendência; com exportação pendente, o Google ainda mostra uma versão velha, e nada é comparado. Movido de novo: a mesma pendência ganha a nova proposta. De volta ao horário do sistema: a pendência fecha como SUPERSEDED (valor novo do enum). Evento novo criado à mão no secundário é ignorado: o secundário é saída do sistema (D-15).
  - **Aceitar** MOVED remarca pelo `rescheduleAppointment` (D-11), no horário e na duração propostos, com a checagem de conflito de qualquer agendamento; só o gestor aceita como encaixe (D-43). **Aceitar** DELETED leva a Cancelado pelo consultório. Os dois gravam a origem GOOGLE e a pessoa que resolveu como autora, e a pendência fecha como ACCEPTED na mesma transação. **Reverter** marca o agendamento para exportar de novo: o Google volta ao horário do sistema, ou o evento apagado é recriado.
  - **Quem resolve:** secretária, gestor e admin (`google-changes:resolve`), e o profissional só na própria agenda (`-own`, D-10). Novo ator `google` no `checkTransition`: só Agendado ou Confirmado para Cancelado pelo consultório, e Reagendado pela remarcação.
  - **Mudança no sistema** (status, remarcação) antes da decisão fecha a pendência como SUPERSEDED: vale o sistema, e a exportação devolve a versão dele ao Google.
  - **Conflito (regra 4):** bloqueio do Google sobre um atendimento que ocupa o horário aparece como alerta na tela Google Agenda, calculado na leitura. Nada é cancelado.
  - Auditoria: `google_change.detected` (ator GOOGLE) e `google_change.reverted`; o aceite grava a mudança de status como qualquer outra.
- **Motivo:** PRD 5 (regras 3 e 4), PRD 10 (evento arrastado no Google), D-10, D-11 e D-43.
- **No PRD:** seção 5 (Fluxo de dados, regras 3 e 4).

### D-64 · Telas do Google Agenda

- **Status:** Decidida em 29/10/2026.
- **Decisão:**
  - **Profissionais** (`/conta/[id]/profissionais`, `google:send-link`, gestor e admin): a lista com a situação do vínculo de cada um e, em cada perfil, enviar o link, ver o aviso de revogado e desvincular, sem os nomes dos calendários pessoais.
  - **Meu perfil** (`/conta/[id]/perfil`, `google:link-own`, o profissional): vincular, vincular de novo, desvincular, calendários que contam como ocupado e a regra de dia inteiro. O QR Code da WhatsAPI, que a D-23 também põe no perfil, continua fora (anotado no Bloco 5).
  - **Google Agenda** (`/conta/[id]/google`, quem resolve pendências; o profissional vê só as dele): pendências com Aceitar, Reverter e, para o gestor, Aceitar como encaixe; conflitos com o Google; e, para o gestor, os vínculos desconectados. É a lista "Pendências do Google Agenda" da seção 11.
  - **Avisos da regra 6:** faixa na agenda para o gestor (os profissionais desconectados, com link para o perfil) e para o profissional (o próprio vínculo), e o aviso no perfil.
  - **Agenda e agendamento:** card com "Pendência do Google"; no detalhe, a pendência com os botões e a situação do evento no Google; no novo agendamento, a prévia do mockup ("Evento "Carlos · Procedimento" será criado no calendário "Consultório Dr. Otávio"."), quando o profissional tem secundário.
  - **Páginas públicas:** `/google/vincular/[token]` (o link do gestor) e `/google/vincular/concluido` (fim do vínculo ou o motivo da falha) entram nos prefixos públicos do `proxy.ts`.
- **Motivo:** PRD 3 (Usuários e Google Agenda), PRD 5 (regras 3, 4 e 6), PRD 11 (Perfil do profissional, Listas de trabalho) e D-23.
- **No PRD:** seção 11.

## Teste real em 01/11/2026

### D-65 · Teste com o Google real

- **Status:** Decidida em 01/11/2026.
- **Como foi:** cliente OAuth de um projeto de teste do Google Cloud e uma conta Google de Felipe Guedes, não de um profissional, vinculada à Dra. Marina Castro no banco de desenvolvimento, com `npm run inngest:dev` rodando. Túnel `cloudflared` aberto pelo usuário. O consentimento e o aceite do app foram autorizados por ele. Os eventos de teste de bloqueio ficaram num calendário temporário criado pelo próprio app, e os arrastes e exclusões foram feitos pela API no calendário secundário, porque os escopos só deixam escrever em calendários do app: as agendas pessoais não foram alteradas. No fim, o temporário e o secundário foram apagados e o acesso, revogado.
- **Medições:**

  | O que | Tempo | Meta |
  | --- | --- | --- |
  | Agendamento no Google, pelo evento do Inngest | 2,3 s | 30 s |
  | Bloqueio, com push | 9,4 s | 5 min |
  | Evento arrastado vira pendência, com push | 8,1 s | 5 min |
  | Bloqueio só com o polling de 4 min, evento criado logo depois do tick (pior caso) | 3 min 51 s | 5 min |
  | Evento arrastado vira pendência, só com o polling, mesmo caso | 3 min 50 s | 5 min |

- **Conferido no Google real:**
  - Calendário "Clínica Dra. Marina" criado, com o evento "Vanessa · Consulta (Agendado)", o endereço da unidade, o link do agendamento e o id em `extendedProperties.private`; sem observação interna nem telefone.
  - O secundário da própria conta não gerou nenhum bloqueio. Evento ocupado bloqueou; evento de dia inteiro livre bloqueou de 00:00 a 00:00 em Fortaleza; evento livre com hora não bloqueou; o calendário "Feriados no Brasil", só de leitura, ficou de fora. Os calendários da conta geraram 310 bloqueios em 90 dias, recorrentes expandidos, só com os horários; a agenda mostra "Compromisso Google", sem o título. Um compromisso real sobre um atendimento apareceu nos conflitos, sem cancelar nada.
  - Reverter um arraste devolveu o horário. Excluir o evento virou pendência, e reverter o restaurou com o mesmo id (o patch do Google aceita evento apagado). Aceitar um arraste remarcou no horário e na duração do Google, apagou o evento antigo e criou o novo.
  - Token que o Google não conhece: `invalid_grant`, vínculo REVOKED e aviso no perfil, na agenda e na tela Google Agenda. Desvincular apagou o secundário, parou os canais, limpou bloqueios e ids de evento, fechou as pendências e revogou o acesso: o token antigo passou a receber `invalid_grant`.
- **O que o teste corrigiu:**
  - O calendário novo só entrava na lista pelo job diário, contra a D-60: agora cada sincronização do vínculo atualiza a lista.
  - Com polling de 5 minutos o pior caso sem push fica acima do critério: a primeira medição deu 5 min 58 s, com o servidor de desenvolvimento recompilando e os testes rodando. O polling passou a 4 minutos (D-61).
  - Vínculos falsos da demo seriam marcados como revogados com o Google de verdade ligado (`googleProviderFor`, D-58).
  - O `serverExternalPackages` avisava que não conseguia deixar o `googleapis` de fora com o caminho de diretório no import: o import passou a citar o `index.js`.
- **Para configurar um projeto do Google Cloud:**
  - **Ativar a Google Calendar API.** Sem ela, o vínculo funciona, mas criar o calendário falha ("API has not been used in project"). O sistema mantém o vínculo e tenta de novo na sincronização seguinte; a ativação leva alguns minutos para valer.
  - **App em Testing:** só as contas em "Usuários de teste" passam da tela do Google (erro 403 `access_denied`, que o sistema nem chega a ver). Em produção (D-24), passa qualquer conta, com o aviso de app não verificado.
  - Fora de produção, a conta precisa estar em `GOOGLE_ALLOWED_ACCOUNTS` antes do consentimento. Uma conta fora da lista é recusada na volta, e o que o Google deu é revogado.
- **Não testado com o Google real:** arrastar com o mouse na tela do Google Agenda (a mudança pela API é a mesma para a leitura); o clique no botão "Desvincular", cuja caixa de confirmação não dá para conduzir daqui (foi chamado o mesmo serviço); a revogação feita pelo usuário em myaccount.google.com, que foi simulada com um token inválido; o link enviado pelo gestor, testado só com o sandbox; o build de produção, porque o teste rodou no servidor de desenvolvimento.
- **No PRD:** seção 5 (Fluxo de dados), seção 12 (preparação, item 6).

## Bloco 7 em 01/11/2026

Decisões tomadas no Bloco 7 (SynkronosCRM pela API do FlwChat). O mapeamento da API, com o que ela não documenta, está em `docs/flwchat.md`.

### D-66 · Ação da secretária na Synkronos: etiqueta de comando

- **Status:** Decidida em 01/11/2026, por Felipe Guedes, entre as opções levadas a ele.
- **Problema:** o PRD supunha um evento "secretária marcou contato manual ou confirmação". A API do FlwChat não tem esse evento: a lista é fechada (conversas, mensagens, contato, etiquetas, pagamentos, cards e modelos).
- **Decisão:**
  - A secretária aplica uma **etiqueta de comando** no contato, sem sair da conversa: "Confirmar na agenda" ou "Contato manual na agenda". O sistema reage ao evento `CONTACT_TAG_UPDATE` e tira a etiqueta depois de agir.
  - **Alternativas descartadas:** card em painel (`PANEL_CARD_STEP_CHANGE`) identificaria o agendamento exato, mas pede painel e etapas por conta, depende do plano e tira a secretária da conversa; classificação ao concluir (`SESSION_COMPLETE`) obriga a concluir a conversa; comando em texto (`MESSAGE_SENT`) pode ir ao paciente por engano e falha em silêncio.
  - **Agendamento de destino:** a etiqueta é do contato e não diz qual agendamento, então vale a D-08: o agendamento da última mensagem de régua enviada àquele paciente, de qualquer instância, enquanto o atendimento estiver no futuro, e nunca um mais antigo.
  - **Confirmar:** de Agendado vai para Confirmado por `changeAppointmentStatus`, com o novo ator `crm` (`CrmActor`) e a origem `CRM`, sem usuário; a auditoria registra o ator CRM, e a régua para pela tabela existente (D-06, D-53). O `checkTransition` só deixa esse ator ir de Agendado a Confirmado. O evento não diz quem aplicou a etiqueta.
  - **Contato manual:** encerra os pedidos de confirmação e fecha os marcadores Sem confirmação e Respondeu sem confirmar, sem mudar o status (D-06), como o botão da agenda (`applyManualContact`).
  - **Quando nada muda:** a etiqueta sai do mesmo jeito, para a secretária poder aplicá-la de novo, e uma nota na conversa diz o motivo (sem mensagem de régua, atendimento já passou, agendamento encerrado, celular que não é de paciente). Isso inclui paciente que nunca recebeu mensagem de régua: pela D-08 não há destino, e a secretária confirma pela agenda.
  - **Duas famílias de etiqueta:** comando é entrada; status ("Agenda: Confirmado") é saída, escrita e sobrescrita pelo sistema. Só comando faz o sistema agir. Os nomes não se parecem de propósito: o teste real mostrou o erro que nomes parecidos causam (D-70).
  - O log `CrmInboundEvent` guarda cada comando e o resultado (códigos em `CRM_OUTCOME_LABELS`), só com ids.
- **Provedor:** interface `CrmSync` (`src/lib/crm/provider.ts`), no desenho de `MessagingProvider` e `GoogleCalendarProvider`. Real em `flwchat.ts`, com fetch próprio; sandbox em `sandbox.ts`, nas tabelas `SandboxCrm*`, uma conta falsa por conta do sistema, padrão fora de produção (`CRM_PROVIDER`). Fora de produção, o cliente real recusa, antes de qualquer requisição, contatos fora de `CRM_ALLOWED_CONTACTS`. Um token que começa com `sandbox-` continua no sandbox mesmo com o cliente real ligado, para um teste real não marcar como revogadas as conexões falsas. Erros saem como `CrmError` com um tipo: `auth`, `not_found`, `rate_limited`, `transient` e `rejected`.
- **Exceção de produção:** o build de produção do e2e (D-46) roda no banco de teste e não tem com quem falar. Por isso `crmMode` aceita o sandbox em produção só quando o banco é `*_test` (D-32), condição que nenhum ambiente real cumpre; não há variável nova que possa ligar o sandbox em produção por engano.
- **Conta compartilhada:** uma conta da Synkronos pode atender vários consultórios (D-73).
- **No PRD:** seção 4 (Transições), seção 6 (Integração com a SynkronosCRM), seção 12 (Bloco 7).

### D-67 · Webhook da Synkronos sem assinatura

- **Status:** Decidida em 01/11/2026.
- **Problema:** a assinatura do FlwChat só aceita nome, URL, eventos e ativo: não há segredo, assinatura nem header. O evento não tem id, e a política de novas tentativas não está documentada.
- **Decisão** (`src/lib/crm/webhook.ts`, rota `/api/webhooks/synkronos/[token]`):
  - **Segredo na URL:** 32 bytes, por conta da Synkronos, guardado só como SHA-256 (`CrmAccount.webhookSecretHash`), como o convite (D-38). Quem chega sem ele recebe 401. Evento cujo `companyId` não é o da conta também recebe 401.
  - **O corpo não vale nada:** o sistema relê o contato na API, com o token da conta, e age só sobre as etiquetas que a API mostra. Um evento forjado por quem descobrir a URL não encontra a etiqueta e não muda nada. O corpo só serve para evitar a releitura quando ele já mostra que não há comando, caso das etiquetas do próprio sistema.
  - O IP de saída publicado (`18.215.79.89`) não é conferido: ele pode mudar sem aviso, e um bloqueio aí pararia a integração em silêncio; a releitura já cobre o risco.
  - **Evento repetido:** `CrmInboundEvent.deliveryKey` é o SHA-256 de tipo, data e contato, e uma entrega igual é ignorada. Se a data mudar, a etiqueta já saiu e nada acontece. Se a etiqueta não saiu porque o CRM falhou, confirmar de novo não muda nada e o contato manual não grava outra linha.
  - **CRM fora do ar durante o evento:** a resposta é 200, para o FlwChat não desligar a assinatura por erros seguidos, e o Inngest relê o contato com novas tentativas (`crm/contact.check`). O que se perder mesmo assim continua na etiqueta, para a reconciliação (D-69).
  - Assinatura só de `CONTACT_TAG_UPDATE`, e a rota ignora qualquer outro evento: mensagem do paciente não entra por aqui (D-05).
- **Motivo:** PRD 10 (status divergente), D-05 e D-08.
- **No PRD:** seção 6 (Integração com a SynkronosCRM).

### D-68 · O que vai para a Synkronos, token e tela

- **Status:** Decidida em 01/11/2026.
- **Decisão** (`src/lib/crm/outbound.ts`, `queue.ts`, `connection.ts`, `settings.ts`):
  - **Contato:** paciente criado (cadastro rápido, planilha) ou celular alterado vira contato criado ou atualizado. O sistema procura primeiro pelo celular, com e sem o nono dígito (`phoneVariants`, D-55), e se liga ao contato que a conversa já criou (`Patient.crmContactId`), sem renomeá-lo (D-73). A troca de celular não existia: entrou `updatePatientPhone` e um formulário na tela do paciente. Paciente sem consentimento de WhatsApp também vira contato: ninguém recebe mensagem por isso, e o CRM é operador da agenda (D-19).
  - **Etiqueta de status:** é do contato, não da conversa, e o FlwChat não tem etiqueta de conversa. Por isso há uma só por contato, a do próximo agendamento ainda à espera, em qualquer consultório da conta (D-73); sem nenhum, a do mais recente. As outras etiquetas do contato ficam.
  - **Nota interna:** a conversa mostra cada mudança em nota: "Agenda: Confirmado · Procedimento · Dra. Ana · Unidade Aldeota · 20/11/2026 às 10:00". É o único jeito de a conversa mostrar esses dados. Vai o nome exibido do tipo (D-14), nunca o nome do paciente, o celular ou a observação interna. A nota vai para a conversa mais recente com o número do profissional do agendamento, nunca para outra (D-73). Sem conversa com esse número, ou profissional sem número, fica só a etiqueta: a API não abre conversa sem enviar mensagem, e o sistema não envia mensagem pelo CRM.
  - **O que marca:** criado, confirmado, reagendado, cancelado, atendido e faltou. Chegou e Em atendimento ficam fora, como no PRD. Uma nota por status (`crmSyncedStatus`): exportar de novo não duplica. Agendamento já passado que nunca chegou ao CRM não é enviado, como no Google (D-62), para a importação de uma planilha não encher as conversas de atendimentos antigos.
  - **Fila:** `crmSyncRequestedAt` em `Appointment` e `Patient`, marcado na mesma transação por `markForCrmSync` e `markPatientsForCrmSync`, só com a conta conectada, e `requestCrmSync` depois do commit, como no Google (D-62). Um tick por minuto pega o resto. A limpeza da marca é condicional ao valor lido.
  - **Falhas:** nada disso impede a agenda. Erro transitório volta com espera crescente (1, 2, 4... até 60 min), até 8 tentativas, cerca de 2 h, e depois fica em `crmSyncError`, com "Tentar de novo" na tela. Uma execução desiste depois de 3 falhas transitórias seguidas, para não acumular tempos de espera. 429 para a execução sem gastar tentativa. Token recusado marca a conexão como REVOKED, mantém as marcas e avisa na tela, até o gestor informar outro. Pedido recusado fica no erro.
  - **Ritmo:** o limite é de 1.000 requisições a cada 5 min por conta, cerca de 200 por minuto. Uma linha custa até 4 requisições, e cada execução leva até 40 linhas.
  - **Token:** só criptografado (`encryptSecret`), em `CrmAccount` (D-73); a coluna `Practice.flwchatTokenEncrypted`, nunca usada, saiu, para uma leitura comum da conta não carregar o token. Antes de salvar, o sistema confere o token criando as etiquetas que faltam; token recusado ou FlwChat fora do ar não salva nada. A auditoria guarda só nomes de campos. Conectar envia os agendamentos futuros em aberto; desconectar para tudo e não apaga nada na Synkronos.
  - **Tela Configurações** (`/conta/[id]/configuracoes`, `practice-settings:edit`): token (nunca mostrado de volta), situação, webhook, fila, falhas, última reconciliação, as duas etiquetas explicadas e as últimas ações da secretária. A janela de envio continua na tela da régua (D-56). O "exigir 2FA" da seção 11 ficou de fora deste bloco e entrou nesta tela com a D-71.
  - **Exclusão e exportação do titular (D-28, D-49):** a exportação traz `contatoNaSynkronos` e os ids das notas. A exclusão zera aqui o que é pessoal na hora e pede à exportação que apague na Synkronos o que o sistema escreveu: as notas (`Appointment.crmNoteIds`) e as etiquetas da agenda. Depois disso o paciente perde o vínculo. Isso é tentado até dar certo. **Limite:** a API não apaga contato, e o contato e as conversas são da própria Synkronos; a tela de exclusão avisa o gestor para excluí-los lá. A nota apagada continua listada pela API, com status `DELETED` e o texto (D-70).
  - **Auditoria:** `crm.connected`, `crm.disconnected`, `crm.webhook_registered`, `patient.updated` e as mudanças de status com o ator CRM. Só ids e nomes de campos.
- **Motivo:** PRD 6 (Integração com a SynkronosCRM), PRD 7 (LGPD), PRD 11 (Configurações da conta), D-14, D-23, D-28, D-49 e D-62.
- **No PRD:** seção 6, seção 7 (LGPD), seção 11.

### D-69 · Reconciliação diária

- **Status:** Decidida em 01/11/2026.
- **Decisão** (`src/lib/crm/reconcile.ts`): às 17h de Fortaleza (20h UTC), uma hora antes dos pedidos D-1 das 18h, cada paciente com agendamento Agendado ou Confirmado no dia seguinte, no fuso da unidade, tem o contato lido no CRM:
  - comando que ainda está no contato é aplicado, com a origem `reconciliation` no log. É o caso do webhook perdido, de um CRM fora do ar ou de ambiente sem URL pública;
  - etiqueta de status diferente, ou contato que não existe, marca os agendamentos para exportar. O sistema é a fonte do status, e a exportação não repete a nota (`crmSyncedStatus`);
  - só comando muda a agenda: quem trocar uma etiqueta de status à mão não muda agendamento nenhum.

  CRM fora do ar ou no limite encerra a rodada sem erro, e a de amanhã tenta de novo. `CrmConnection.reconciledAt` só anda quando a rodada termina, e a tela mostra essa data.
- **Motivo:** PRD 10 (status divergente: "secretária confirma no CRM e a régua segue disparando").
- **No PRD:** seção 10.

### D-70 · Teste com o FlwChat real

- **Status:** Decidida em 02/11/2026.
- **Como foi:** a primeira leitura, antes de qualquer escrita, mostrou que o token não era de uma conta de teste, e sim de uma conta real, grande, com muitos contatos, etiquetas e canais. Felipe Guedes decidiu seguir nela, com webhook por tempo curto, escrevendo só num contato de teste, o celular dele, em `CRM_ALLOWED_CONTACTS`. Consultório: Clínica Dra. Marina, no banco de desenvolvimento, com `npm run inngest:dev` e túnel `cloudflared`. As mensagens seguiram no sandbox: nenhum WhatsApp saiu.
- **Medições:**

  | O que | Tempo |
  | --- | --- |
  | Conectar: conferir o token, criar 8 etiquetas e assinar | 6,7 s |
  | Agendamento até a nota na conversa, pelo Inngest | cerca de 2 s |
  | **"Confirmar na agenda" aplicada na tela da Synkronos até Confirmado, com a régua parada** (do `date` do evento à mudança de status) | **4,0 s** |
  | Confirmado até a nota e a etiqueta de status | cerca de 2 s |
  | Evento de outro contato descartado, sem chamar a API | 47 ms em média, 369 ms no máximo |

- **Conferido na API real:**
  - O critério do Bloco 7: Felipe aplicou a etiqueta pela tela, numa conversa em andamento, e o agendamento foi a Confirmado com origem CRM, os pedidos de confirmação pendentes foram cancelados com o motivo "confirmed", a etiqueta de comando saiu do contato e a nota entrou na conversa.
  - Contato manual: encerrou os pedidos sem mudar o status, com a nota na conversa. Foi conduzido com a etiqueta aplicada pela API e o evento reenviado ao webhook pelo túnel, no formato medido.
  - Webhook perdido: etiqueta sem evento, e a reconciliação confirmou. Rodada por script, não pelo cron.
  - Evento repetido reconhecido, evento forjado sem efeito (o corpo dizia que havia comando, a API dizia que não) e segredo errado com 401.
  - Nota vai para a conversa do canal do profissional, também em conversa concluída. Mudança de etiqueta de outros contatos: todos os eventos descartados.
- **O que o teste corrigiu:**
  - **Contato inexistente responde HTTP 500**, não 404. O cliente tomaria isso por instabilidade e nunca criaria o contato. Agora a `key` e o texto decidem.
  - **Conta compartilhada e nota no canal certo:** a conta real atende muitos consultórios, e a nota ia para a conversa mais recente, que podia ser de outro deles. Virou a D-73.
  - **Nomes dos comandos:** o próprio Felipe aplicou `Agenda: Confirmado` achando que era `Agenda: confirmar`, e nada aconteceu. A secretária erraria igual. Os comandos passaram a ser **Confirmar na agenda** e **Contato manual na agenda**, e um teste impede que voltem a parecer etiquetas de status.
  - **Nomes em maiúsculas:** a API devolve `AGENDA: CONFIRMADO` no contato e no evento. A reconciliação comparava o nome exato e veria uma diferença todo dia. Agora os nomes são comparados por `sameTag`, e o CRM falso responde como a API.
  - **Etiquetas repetidas:** a API aceita nome repetido, e a lista dela tem cache de alguns minutos. Conectar de novo poderia duplicar as etiquetas numa conta com milhares delas. Agora só são criadas quando a conta entra no sistema.
  - **Nota de contato manual fora da exclusão:** ela diz que há um agendamento, e a exclusão do titular não a apagaria. Agora fica em `crmNoteIds`, como as outras.
  - **Etiquetas pela API não geram evento**, só as da tela. Isso é bom: as escritas do sistema não voltam como evento. Por outro lado, um comando aplicado por automação na Synkronos só seria visto pela reconciliação.
- **Limpeza:** assinatura removida, as assinaturas que já existiam intactas e inativas, 10 etiquetas apagadas (as 8 da conexão, depois as 2 com os nomes novos), etiquetas do contato de volta às de antes, nome do contato nunca alterado, conexão e token fora do banco, instância de volta ao número original e agendamentos de teste cancelados. **As notas apagadas continuam listadas pela API, com status `DELETED` e o texto:** isso vale também para a exclusão do titular (D-68). A tela da Synkronos não foi conferida quanto a elas.
- **Não testado com o FlwChat real:** criar um contato e trocar o celular de um contato, para não mexer em contatos reais; a exclusão pelo fluxo completo (apagar nota e tirar etiqueta foram feitos pela API); a reconciliação pelo cron; limite 429 e FlwChat fora do ar; dois consultórios de verdade na mesma conta; e o build de produção.
- **No PRD:** seção 6 (Integração com a SynkronosCRM), seção 12 (Bloco 7).

### D-71 · Tela do "exigir 2FA"

- **Status:** Decidida em 01/11/2026.
- **Decisão** (`src/lib/auth/two-factor-requirement.ts`): o gestor liga e desliga `Practice.requireTwoFactor` em Configurações (`practice-settings:edit`). A regra da D-36 não muda; a tela só avisa o que ela faz:
  - **Antes de ligar:** a tela diz que quem ainda não ativou é levado a `/seguranca` em toda página, em qualquer conta em que trabalhe, porque o 2FA é do usuário (D-16). Ela lista pelo nome quem é essa pessoa: alocações ativas e admins da organização, o mesmo alcance de `isTwoFactorRequired`, lidos pelo cliente base porque os admins não têm alocação na conta. A lista continua na tela depois de ligar, para o gestor saber quem falta.
  - **O próprio gestor:** se ele ainda não ativou, um alerta à parte diz que ele também vai para `/seguranca`, com o link para ativar antes, e a confirmação repete isso. Ao confirmar, a Server Action grava e passa pela guarda, que o leva para lá na hora. A guarda não abre exceção: para desligar, ele precisa ativar antes, ou pedir a outro gestor ou ao admin da organização. Por isso o aviso vem antes.
  - **Desligar:** não desativa o 2FA de ninguém. Quem já ativou continua com ele até desativar na tela Segurança, e quem está em outra conta que exige continua preso à regra dela.
  - **Quem entra com Google:** ativar pede a senha, e todo usuário nasce com senha pelo convite (D-38). Ligar não prende quem costuma entrar com Google.
  - **Valor pedido, não inversão:** a ação recebe o valor que o gestor quer. Sem mudança, nada é gravado, e uma segunda aba com a tela antiga não desfaz a primeira.
  - **Auditoria:** `practice.two_factor_required` e `practice.two_factor_not_required`, com `changedFields: ["requireTwoFactor"]`. Só o nome do campo (D-28).
- **Motivo:** PRD 11 (Configurações da conta), D-16, D-23, D-36. Ligar sem aviso tiraria da agenda, na hora, todo mundo que não ativou, inclusive quem ligou.
- **No PRD:** seção 11.

### D-72 · Cache Components desligado, para o status HTTP valer

- **Status:** Decidida em 01/11/2026.
- **Problema:** no build de produção, tudo o que a checagem de sessão nega respondia 200: tela sem permissão e conta sem acesso (os 403 e 404 da D-39 e da D-40), paciente que não existe, sessão inválida e `/` com sessão (os redirecionamentos). Dos 17 casos medidos em `next start`, 9 estavam errados. O conteúdo já era negado; só o status estava errado.
- **Causa:** `cacheComponents: true`, que veio do scaffold e nunca foi uma decisão. Com ele, o `next build` gera um shell para cada rota, e o `instant = false` não impede isso: só desliga a validação do shell. O shell dessas telas tem 0 bytes, mas o Next escreve esse pedaço vazio na resposta, e a primeira escrita envia os cabeçalhos com 200, cerca de 90 ms antes de a tela de erro ficar pronta. O `forbidden()` chega tarde. Nem o `next dev`, nem os testes de página mostram isso.
- **Decisão:**
  - `cacheComponents` e `partialPrefetching` saem do `next.config.ts`, e com eles as 25 exportações de `instant`, que sem o `cacheComponents` são erro de build. O app não usava `use cache`, `cacheLife` nem `cacheTag`, e nenhuma tela autenticada tinha shell com conteúdo. Essas telas viram rotas dinâmicas comuns; `/termos` e `/google/sandbox` seguem estáticas.
  - **Regra:** nada de `<Suspense>` nem `loading.tsx` acima da checagem de `src/lib/auth/guard.ts`. O status se fixa quando a resposta começa a sair, e depois disso `forbidden()`, `notFound()` e `redirect()` só trocam a tela.
  - **Teste:** `e2e/status.spec.ts` confere os 403, os 404 e os 307 no build de produção. Rodado contra o código anterior, os três testes falham com 200.
  - **O que muda na navegação:** o Next deixa de manter a tela anterior escondida no DOM (`<Activity>`), então o que está só no navegador, como um formulário preenchido e não salvo, se perde ao navegar e voltar. Os prefetches não leem o banco: a carga da agenda fez 37 comandos SQL com os 31 prefetches e os mesmos 37 sem eles.
  - **Alternativas descartadas:** `htmlLimitedBots: /.*/` faz o Next pular o shell e acerta os status, mas vale também para os prefetches: 10 pedidos por tela seguiam abertos ao fim dos 10 s de medição, o que pode esgotar as conexões do navegador. Consultar o banco no proxy contraria a D-40. Reescrever a D-39 para aceitar o 200 não se justifica, porque o conserto existe e não custa nada que o app use.
- **Limite:** medido em `next start` e `next dev`. O deploy na Vercel (PRD 12) ainda não foi testado; `e2e/status.spec.ts` mostra o que conferir lá. Ligar o `cacheComponents` no futuro traz o problema de volta, e esse teste falha.
- **Motivo:** D-39 e D-40. Status 403 e 404 de verdade também evitam que monitoramento e logs contem uma tela negada como sucesso.
- **No PRD:** sem mudança; o PRD não trata de status HTTP.

### D-73 · Conta da Synkronos compartilhada por consultórios

- **Status:** Decidida em 01/11/2026, por Felipe Guedes: consultórios podem dividir uma conta da Synkronos ou ter a sua, e o desenho serve para os dois casos.
- **Problema:** o PRD fala em "token por conta", e o desenho da D-66 supunha uma conta da Synkronos por consultório. A leitura do teste real (D-70) mostrou outra coisa: a conta real é grande e atende muitos consultórios, e o contato de teste tem conversas em vários canais só entre as 20 mais recentes. A mesma pessoa pode ser paciente de dois consultórios da mesma conta.
- **Decisão:**
  - **`CrmAccount`** guarda o token, o webhook e a situação, e não pertence a consultório nenhum, como o `GoogleConnection` (D-04). `CrmConnection` é o vínculo de um consultório com ela. Um token cuja empresa já tem conta entra nela e renova o token; a empresa vem de `companyId`, lido do filtro de contatos ou das assinaturas, porque a API não tem endpoint próprio. Há uma assinatura por conta, e a conta só sai com o último consultório. Token recusado avisa todos os consultórios dela, e um novo, de qualquer um deles, traz todos de volta.
  - **Comando:** o paciente é procurado em todos os consultórios da conta, e vale a última mensagem de régua entre todos (D-08). Se o atendimento dela já passou, nada acontece, nem em outro consultório. O registro fica só no consultório alcançado.
  - **Nota:** só vai para a conversa com o número do profissional do agendamento (`WhatsappInstance.phoneNumber`, comparado com o número do canal). A conversa mais recente do contato pode ser de outro consultório, e a nota diz que há um atendimento, o que é dado sensível (PRD 7). Só o aviso de etiqueta não aplicada, que nada diz de agendamento, pode ir para a conversa mais recente quando não há agendamento.
  - **Etiqueta de status:** é do contato, então considera os agendamentos da pessoa em todos os consultórios da conta, e **aparece para as equipes de todos eles**. Felipe Guedes aceitou isso ao escolher este desenho. A tela Configurações avisa quando a conta é compartilhada e mostra só quantos outros consultórios há, nunca quais.
  - **Contato:** nunca é renomeado. Outro consultório pode conhecê-lo por outro nome, e o nome vale só ao criar. O celular muda quando o paciente muda de celular.
  - **Limite de requisições:** é da conta, e dividido com o que mais usa a conta. As execuções de uma mesma conta não se sobrepõem no Inngest (a chave é a conta), e 429 para a execução sem gastar tentativa.
  - **Volume do webhook:** a assinatura cobre a conta inteira, então chega a mudança de etiqueta de todos os contatos. O corpo sem comando é descartado sem chamar a API, sem gravar e sem registrar nada.
  - **Sandbox:** o CRM falso virou um por conta, com a chave tirada do token, e não pertence a consultório nenhum, como o Google falso (D-58). Dois consultórios com o mesmo token dividem o mesmo CRM falso.
  - **Fora de produção,** o cliente real também recusa entregar um contato lido por id que não esteja em `CRM_ALLOWED_CONTACTS`, e o webhook descarta os outros contatos antes de chamar a API.
- **Limite:** na exclusão do titular, as etiquetas de status saem do contato; se a pessoa continuar paciente de outro consultório da conta, a próxima exportação dele as escreve de novo, sobre o agendamento dele.
- **Motivo:** o que a conta real mostrou (D-70), PRD 7 (dado sensível) e D-08.
- **No PRD:** seção 6 (Integração com a SynkronosCRM), seção 11.

## Bloco 8 em 02/11/2026

Decisões tomadas no Bloco 8 (PWA do profissional e painel de indicadores), o último do MVP. O Web Push foi escolha de Felipe Guedes, entre as opções levadas a ele (D-78).

### D-74 · Painel de indicadores: leitura da tabela da seção 8

- **Status:** Decidida em 02/11/2026.
- **Decisão** (`src/lib/indicators`: `rules.ts` só com as contas, `indicators.ts` com as leituras; tela `/conta/[id]/indicadores`):
  - **Quem vê:** `reports:practice`, gestor e admin da organização. A coluna Relatórios da seção 3 dá à secretária "do dia e da semana" e ao profissional "os próprios": isso já é o painel de valor da agenda (D-41), que entrega exatamente esses recortes. O painel novo não abre para eles.
  - **Período:** os últimos 7, 30 ou 90 dias, com hoje incluído (`?dias=`), e padrão de 30. Cada agendamento e cada mensagem caem no dia da própria unidade (D-03); bloqueio e evento de auditoria, no fuso da agenda (D-41).
  - **Sem dados:** divisão por zero não vira 0%. Sem o que dividir, a tela diz "Sem dados" e o estado da meta também. Estado da meta sempre com ícone e texto, nunca só cor.
  - **Taxa de falta:** Faltou ÷ (Atendido + Faltou), por conta e por tipo. Sem baixa fica de fora e aparece à parte (D-13), só depois do fim do dia local do atendimento.
  - **Confirmação automática:** o numerador é o agendamento com mudança para Confirmado com origem `CADENCE_REPLY`. O denominador, "elegível à régua", é o agendamento com um pedido de confirmação planejado e não pulado no planejamento: fica quem foi perguntado, quem a secretária confirmou antes (pedido cancelado) e quem teve falha de envio. Sai quem nunca entrou na régua, Reagendado (o agendamento novo é que conta) e cancelado antes de o pedido sair.
  - **Valor realizado ÷ previsto:** as definições do painel da agenda, sem diferença (D-13). Um teste compara os dois. Por isso Sem baixa fica no previsto e não no realizado, e a tela diz quanto é.
  - **Entrega de WhatsApp:** `DELIVERED` e `READ` ÷ tudo com `sentAt`. O que nem saiu (`FAILED` sem `sentAt`) não é "enviado" e aparece à parte, para a régua parada não sumir do número.
  - **Cobertura de Google:** vínculo ativo ÷ profissionais ativos, no momento, sem período.
  - **Falhas de sincronização:** só Google, porque a linha vem do PRD 7 (Sincronização) e fala em eventos. Eventos com `googleSyncError` ÷ eventos que a exportação alcançou. **Limite:** o sistema guarda o último estado, então uma falha que se resolveu sozinha não conta.
  - **Ocupação:** minutos ocupados ÷ minutos disponíveis, por profissional e na conta. Disponível é o horário de atendimento de cada dia, no fuso da unidade, sem exceções e bloqueios; duas unidades no mesmo horário contam uma vez. Ocupado segue a D-43: Faltou, cancelado e Reagendado liberam. O que fica fora do disponível não conta, então nunca passa de 100%. Sem meta, como na tabela.
- **Motivo:** a tabela da seção 8 deixa essas leituras abertas, e o Gate 1 depende da taxa de falta (D-26). Fixadas aqui e testadas à mão em `src/lib/indicators/seed.test.ts`, com o seed num domingo conhecido, para que os números não repitam a lógica da implementação.
- **No PRD:** seção 8, seção 11.

### D-75 · Tempo da secretária e adoção: o que passa a ser medido

- **Status:** Decidida em 02/11/2026.
- **Decisão:**
  - **Tempo da secretária em confirmação:** nada media isso antes deste bloco, e não há como recuperar o passado. Medir a partir de agora: a lista Sem confirmação conta um minuto para cada minuto em que a tela está visível e alguém agiu nela nos 2 minutos anteriores (`ConfirmationWorkTime`, uma linha por usuário e dia local; segunda aba não conta em dobro; duas pessoas somam). O indicador é a média de minutos por dia medido. Até haver medição, "Sem dados".
  - **Comparação com o início:** a meta é queda de 60%. O início são os 7 primeiros dias medidos, e a comparação só aparece depois de 14 dias de medição.
  - **Ao lado do tempo,** a tela mostra os contatos manuais do período (`AppointmentFlag` `MANUAL_CONTACT`), que já existem desde o Bloco 5.
  - **O tempo é por pessoa no banco e só o total da conta na tela:** a linha por usuário existe para não contar duas abas. Nenhuma tela mostra o tempo de uma pessoa.
  - **Adoção:** "uso" é ação de usuário na trilha de auditoria (`AuditEvent` com `actorType` USER), que já existe. Conta dias distintos, de segunda a sábado (o padrão da janela de envio, e há consultório que atende no sábado), na última semana completa, no fuso da agenda. A meta da conta é 5 dias ou mais. Conta em que ninguém nunca agiu mostra "Sem dados" e fica fora do denominador.
  - **Quem vê o quê:** o gestor vê os dias de uso da própria conta, e só. A taxa entre contas e a tabela com a falta de cada conta são do admin (`reports:consolidated`), limitadas às contas da organização dele e lidas conta a conta pelo cliente com escopo.
- **Limite:**
  - O tempo mede a lista, como o PRD pede, e não a ligação: falar no WhatsApp em outra janela não conta. Serve para comparar a conta com ela mesma, não como cronômetro.
  - Só ver a agenda não conta como uso, porque leitura não vai para a trilha. Uma semana com feriado pode não chegar a 5 dias: não há calendário de feriados.
  - Não há conta desativada no sistema: "contas ativas" são as que já foram usadas.
- **Motivo:** o pedido do bloco: indicador sem medição não recebe número inventado. PRD 8 e isolamento (D-02, D-30).
- **No PRD:** seção 8.

### D-76 · PWA do profissional: rotas, service worker sem dados e sem conexão

- **Status:** Decidida em 02/11/2026. A instalação em aparelho real está na D-79.
- **Decisão:**
  - **Rotas:** `/pwa` é o `start_url`: vai ao dia da única conta ou mostra a escolha, para quem atende em mais de uma (D-04). `/pwa/[id]` é a tela do dia, fora de `/conta/[id]` para não herdar o cabeçalho do site. Fica em `src/app/(app)/pwa`, sem `<Suspense>` nem `loading.tsx` acima da checagem (D-72).
  - **Escopo:** sempre a agenda da própria pessoa, com a permissão de quem vê agenda (`agenda:view` ou `agenda:view-own`) e o cadastro de profissional ligado ao usuário. Gestor ou admin que também atende vê o próprio dia aqui e a conta inteira no site. Status só por `changeAppointmentStatus`; a tela oferece Marcar chegada, Iniciar atendimento e Atendido, conforme a tabela de status. Pendência do Google com aceitar e reverter, só da própria agenda (D-10).
  - **Diferenças do mockup:** sem a aba Bloquear, porque nenhuma tela do sistema cria bloqueio ainda; sem "Horário livre: secretária consultando lista de espera", que é da fase 2. A pendência do Google é decisão do profissional (D-10), não "revisão pela secretária".
  - **Service worker sem dados de ninguém (`public/sw.js`):** guarda só `offline.html` e um ícone. Não guarda tela nem resposta, e só navegações passam por ele: Server Action, RSC, API e arquivos vão direto à rede. As telas autenticadas respondem `no-store` (conferido no e2e).
  - **Ao sair da conta:** o cache do service worker não tem nada de ninguém, então nada precisa ser apagado. A saída passa a recarregar a página inteira (`window.location`), para nenhuma tela ficar na memória do app, e o botão voltar cai no login.
  - **Sem conexão:** sem cache, abrir o app offline mostra `offline.html`, que diz isso e volta sozinho. Com o app aberto, a agenda sai da tela e entra o aviso (`ConnectionGate`). A tela consulta o servidor a cada minuto enquanto visível e sempre que volta ao primeiro plano; `navigator.onLine` sozinho não basta, porque mente em rede ruim. Ao reabrir depois de 2,5 min, a agenda antiga fica atrás de "Atualizando a agenda…" até chegar a nova: o app pode ter ficado na memória desde ontem. A checagem não renova a sessão (D-37).
  - **Instalação:** texto com o caminho no Android e no iPhone, sem botão: só o Chromium tem o evento, e o guia do Next desaconselha depender dele.
- **Alternativa descartada:** agenda do dia em cache para consulta offline, com o rótulo "pode estar desatualizada". É o que o médico gostaria no subsolo do hospital, mas deixa dado de saúde no aparelho, que precisaria ser apagado ao sair e não apaga se a sessão vencer com o app fechado. PRD 7 pesa mais.
- **Limite:** Semana e Perfil são as telas do site, com o cabeçalho dele. Elas também não têm cache, mas sem conexão mostram `offline.html` só ao navegar.
- **Motivo:** PRD 7 (dado sensível; Mobile) e PRD 11.
- **No PRD:** seção 7 (Mobile), seção 11, seção 12 (Bloco 8).

### D-77 · Dispositivo lembrado: 30 dias, só a pedido e só do profissional

- **Status:** Decidida em 02/11/2026. Fecha o que a D-17 e a D-36 deixaram para este bloco.
- **Decisão:**
  - O Better Auth tem uma única duração de sessão, então o plugin próprio `rememberedDevice` (`src/lib/auth/remembered-device.ts`) expõe `POST /api/auth/remember-device`, pelo limite de tentativas do `/api/auth` (D-35). Ele grava `Session.rememberedDevice`, leva `expiresAt` a 30 dias e regrava o cookie com o mesmo prazo.
  - **Só a pedido:** a tela do app instalado pergunta uma vez, em "Manter este aparelho conectado?". Numa aba do navegador a pergunta não aparece e a sessão continua de 12 h. Uma única tela serve para senha, 2FA e Google, sem caminho próprio em cada login.
  - **Só de quem atende:** a sessão longa é para o celular de quem vê o próprio dia, não para as telas que alcançam todos os pacientes da conta. Secretária e gestor sem cadastro de profissional recebem 403, e vale em todas as telas da mesma sessão.
  - **30 dias desde o último uso:** o `SessionKeepAlive` pede de novo no máximo uma vez por dia, como a D-37 faz na web.
  - **2FA:** continua em todo login (D-36). Lembrar o aparelho não pula o segundo fator: mantém uma sessão que já passou por ele.
  - **Sair:** apaga a sessão na hora. A tela Segurança lista os aparelhos lembrados com Encerrar, para o celular perdido, que ficaria 30 dias conectado.
- **Motivo:** D-17. Sem isso, o médico faria login toda manhã.
- **No PRD:** seção 7 (Segurança).

### D-78 · Web Push por confirmação

- **Status:** Decidida em 02/11/2026, por Felipe Guedes: um aviso para cada confirmação, com ativação por aparelho e texto sem nome de paciente. As outras opções eram deixar fora do bloco e um resumo por dia.
- **Decisão** (`src/lib/push`):
  - **Quando:** Confirmado por qualquer origem que represente a confirmação de agora: resposta no WhatsApp, etiqueta na Synkronos, secretária na tela. Importação é passado e não avisa, nem o próprio profissional que confirmou (gestor que atende).
  - **Texto:** "Um paciente confirmou o horário das 14:30.", "…de amanhã, às 14:30." ou "…de 30/10/2026, às 08:00." Só o horário, porque aparece na tela bloqueada e a existência do atendimento é dado sensível (PRD 7). Nunca o paciente, o tipo, a unidade ou o nome da conta, que pode revelar a especialidade.
  - **Por aparelho:** `PushSubscription` fica pendurada na sessão que ativou (chave estrangeira com cascata). Sair, encerrar em Segurança ou a sessão vencer termina o aviso. Só com o aparelho lembrado, senão o aviso pararia sozinho depois de 12 h sem uso (D-17). A permissão do navegador é pedida dentro do clique.
  - **Endpoint e chaves só criptografados** (`encryptSecret`): quem tem o endpoint envia para o aparelho. A busca é pelo SHA-256.
  - **No último momento:** antes de enviar, o sistema confere se a sessão ainda vale e se a pessoa ainda alcança a agenda daquela conta (`getPracticeAccess`). Desligar um usuário para na hora (PRD 3, requisito 5). Agendamento que mudou ou já passou enquanto esperava na fila não avisa.
  - **Fila:** `Appointment.pushRequestedAt` marcado na mesma transação (`markForConfirmationPush`), `requestConfirmationPush` depois do commit e um tick por minuto, como Google e CRM. **No máximo uma vez:** a marca sai antes do envio, porque repetir o aviso em outros aparelhos é pior que perder um. Se o serviço de push falhar, aquele aparelho perde o aviso e a agenda segue mostrando a confirmação. Falha nunca impede a confirmação.
  - **Provedor:** `pushProvider()`, atrás da interface `PushProvider`. Fora de produção o padrão é o sandbox (`SandboxPushMessage`); o real exige `PUSH_PROVIDER="webpush"` e só alcança `PUSH_ALLOWED_USERS`, para um teste nunca tocar o celular de um profissional. `web-push` 3.6.7, fixado e carregado só pelo provedor real; `npm run push:sandbox` envia e lista sem Inngest.
  - **Chaves VAPID** por ambiente (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Sem a pública, a tela não oferece os avisos. Trocar as chaves invalida as assinaturas de todos os aparelhos.
  - **Reconciliação:** ao abrir, a tela compara a assinatura do navegador com a do servidor: assinatura trocada pelo navegador é regravada, assinatura perdida desliga. Assinatura sem linha no servidor (novo login) fica desligada até a pessoa pedir. Sem o evento `pushsubscriptionchange` no service worker: a tela resolve na próxima abertura.
  - **Operadores:** Google, Apple e Mozilla entregam a mensagem criptografada com as chaves do aparelho (RFC 8291) e não leem o conteúdo: veem que houve uma mensagem para aquele aparelho, e quando. A tela de ativação diz isso. Entra na lista de operadores da seção 7.
- **Limite:** Felipe aceitou o volume: um aviso por paciente, cerca de 20 por dia em cada aparelho. Se incomodar, o resumo diário foi a alternativa considerada. No iPhone só funciona com o app instalado (iOS 16.4 ou mais novo).
- **Motivo:** PRD 7 (Mobile) e D-17.
- **No PRD:** seção 7 (LGPD, Mobile), seção 9, seção 11.

### D-79 · Teste em aparelho real

- **Status:** Testado em 03/11/2026, por Felipe Guedes, em um iPhone e um Android. Instalação e aviso passaram nos dois. **Fica em aberto:** no Android, a sessão continuou viva depois de um Sair relatado como feito; o defeito encontrado foi corrigido, mas a causa não foi provada e o Sair desse aparelho não foi repetido depois da correção. Felipe decidiu seguir sem repetir.
- **Como foi:** build de produção sobre o `agenda_test`, com dados fictícios, Web Push real com chaves descartáveis, geradas só para o teste, e túnel `cloudflared` com vigia que fecha sozinho. O paciente foi simulado (`changeAppointmentStatus` com `CadenceActor`, como faz a resposta "1"), e o envio saiu direto por `sendConfirmationPushes`, sem o Inngest. O login vem do `e2e/data.ts`.
- **Resultado:** "relato" é o que Felipe viu no aparelho; "banco" é o que foi conferido no banco de teste.

  | O que | iPhone | Android |
  | --- | --- | --- |
  | Instala e abre em tela cheia | Sim (relato e captura) | Sim (relato) |
  | Sessão de 30 dias, lembrada | Sim (banco) | Sim (banco) |
  | Aviso ligado, serviço de push | Sim, `web.push.apple.com` (banco) | Sim, `fcm.googleapis.com` (banco) |
  | Serviço aceitou o envio | Sim, 10:51:43 | Sim, 11:02:07 |
  | Aviso apareceu no aparelho | Sim (relato; onde, não informado) | Sim, na tela bloqueada (relato) |
  | Tocar no aviso abre a agenda do dia | Sim (relato) | Sim (relato) |
  | Modo avião, app aberto: a agenda sai e aparece "Sem conexão" | Sim (relato) | Sim (relato) |
  | Modo avião, abrindo de novo: a página sem dados | Sim (relato) | Sim (relato) |
  | Sem o modo avião, a agenda volta sozinha | Sim (relato) | Sim (relato) |
  | Sair leva ao login | Sim (relato) | Sim (relato) |
  | Sair encerra a sessão e o aviso | **Sim** (banco: nada sobrou) | **Não** (banco: sessão e assinatura seguiram lá) |

- **O que o teste corrigiu:**
  - **Sair que parecia ter saído:** no Android, o Sair foi tocado dentro do app, e a tela foi para o login, mas às 11:05:52 o banco ainda tinha a sessão criada às 11:00:11 e a assinatura das 11:01:28. Era a única sessão, então não foi outra conta nem outro navegador. O botão ignorava a resposta do servidor e ia para o login de qualquer forma. Com uma sessão de 30 dias e aviso na tela bloqueada, isso deixaria a pessoa acreditando que saiu. Agora só a resposta do servidor encerra: sem ela, a tela fica onde está e diz "Não foi possível sair". O caso entrou no `e2e/pwa.spec.ts`, que falhava com o código anterior.
  - **Causa não provada:** o servidor não guarda registro de pedidos e o log de erros ficou vazio. Um erro momentâneo no túnel, logo depois de sair do modo avião, explicaria o que se viu, mas é hipótese.
- **O que o aparelho mostrou:**
  - **iPhone:** o app instalado abriu já logado, com a mesma sessão criada no Safari. O login não foi separado, ao contrário do que se esperava.
  - **Roteiro:** o primeiro teste, em 02/11, não enviou aviso nenhum: o roteiro punha o Sair antes do envio, e o Sair apaga a assinatura. Em testes futuros, o Sair vem por último.
  - **Entrada pelo link:** no navegador, o login leva à agenda do site, não à tela do dia. Quem instala cai na tela do dia, pelo `start_url`.
- **Não testado em aparelho real:** o Sair do Android depois da correção; o envio pelo Inngest (evento e tick), em vez do envio direto; a resposta de um paciente de verdade no WhatsApp; entrar com Google dentro do app; os 30 dias passando de fato; o deploy na Vercel. Modelos e versões dos aparelhos não foram anotados.
- **Limpeza:** túnel fechado às 11:05:54, vigia encerrado e chaves de teste apagadas. A sessão e a assinatura que sobraram do Android ficaram só no `agenda_test`, que é recriado a cada `npm test` e e2e, e sem a chave privada ninguém mais envia para aquela assinatura.
- **Conferido em Chromium de teste (`e2e/pwa.spec.ts`):** o Chromium considera o app instalável (`Page.getInstallabilityErrors`, sem erros), service worker ativo, cache só com a página offline e o ícone, offline sem dado de paciente, sessão de 30 dias e avisos com a parte do navegador simulada.
- **No PRD:** seção 12 (Bloco 8).

### D-80 · Banco local por 127.0.0.1

- **Status:** Decidida em 02/11/2026. Combinada com Felipe Guedes na sessão que coordena os blocos e aplicada neste bloco.
- **Problema:** no Windows, `localhost` pode cair em `::1`, onde a porta 5432 é atendida pelo `wslrelay`, que derruba parte das conexões. Só o ambiente de desenvolvimento passa por isso.
- **Medições** (da sessão que coordena os blocos, salvo a última):
  - `::1:5432`: 78 de 80 conexões bem-sucedidas, nas duas medições. `127.0.0.1`: 160 de 160.
  - Com `localhost`, quatro rodadas do e2e falharam, por causas variadas (login lento, `P1017`, `ECONNRESET` e uma com a saída perdida). A única rodada por `127.0.0.1` passou, com 13 de 13.
  - Neste bloco, `prisma migrate diff` por `localhost` deu `P1001` e, por `127.0.0.1`, funcionou.
- **Decisão:** `DATABASE_URL` e `DATABASE_URL_TEST` usam `127.0.0.1`, no `.env` e no `.env.example`. As outras URLs, como `BETTER_AUTH_URL`, continuam como estão.
- **Limite:** a relação com a falha do login não foi provada. A produção não é afetada.
- **No PRD:** sem mudança; o PRD não trata do ambiente de desenvolvimento.

### D-81 · Navegação: menu lateral e topo com busca

- **Status:** Decidida em 02/11/2026, por Felipe Guedes, que validou o [canvas da proposta](https://claude.ai/artifact/PzwcNxqHUmd23HtfYH7eJn).
- **Decisão:** menu lateral com ícone e nome: Agenda, Pendências (com contador), Pacientes e Indicadores, e Configurações embaixo, abrindo grupos (Atendimento, Equipe, Consultório). No topo ficam a busca de paciente, a conta, Agendar e o menu do usuário (Meu perfil e App do celular para quem atende, Segurança, Sair). No celular, menu embaixo com as entradas diárias e Mais. A cor continua verde-azulado: o roxo das referências ficaria perto de Exame e Em atendimento (D-42).
- **Como fica no código:** `sections.ts` diz o lugar de cada tela. A antiga Configurações passa a `/integracoes` ("Segurança e integrações"), e `/configuracoes` é a página com todos os grupos.
- **Saída:** o menu do usuário e a página Mais usam a mesma `signOutAndLeave()` do botão Sair e seguem a D-79: só a resposta do servidor encerra, e sem ela a tela fica onde está e avisa.
- **Motivo:** o gestor via 10 itens no mesmo nível, que quebravam em 2 linhas a 1280 px e empilhavam no celular.
- **No PRD:** seção 11.

### D-82 · Agenda enxuta: faixa de resumo, cartão sem valor, horário livre clicável

- **Status:** Decidida em 02/11/2026, por Felipe Guedes.
- **Decisão:**
  - Barra da agenda em uma linha, com categoria e status dentro de Filtros. Os 4 cartões do painel de valor viram uma faixa com os mesmos números.
  - O cartão da grade tem paciente, hora e tipo, sem o valor. O status é um ícone, e só o que pede ação tem texto. O valor continua na lista do dia, na faixa e no detalhe, que é o que a seção 4 exige.
  - O horário livre oferece Agendar e Bloquear ao passar o mouse, com data e hora preenchidas, da hora atual em diante. Esses links ficam fora da ordem de tabulação, para a semana não virar 100 paradas; o teclado tem Agendar e Bloquear nas barras.
  - Lista do dia com uma ação principal por linha e as outras em ⋯.
  - No novo agendamento, convênio, origem do lead, observação e valor ficam em Mais detalhes, e o encaixe só aparece depois que o conflito é apontado. A lateral oferece as horas livres dentro do horário de atendimento, e um clique preenche a hora.
  - No celular, sem `visao` na URL, a agenda abre na lista do dia, reconhecendo o aparelho pelo user agent.
  - Os links de cartão e de horário livre não fazem pré-carregamento (`prefetch={false}`). Com ele, abrir a semana mandava cerca de 120 pedidos ao servidor, que competiam com o clique da pessoa.
- **Motivo:** a grade começava a cerca de 330 px do topo (estimativa pelas classes), e o horário livre não era clicável.
- **No PRD:** seções 4 e 11.

### D-83 · Detalhe do agendamento em painel, por parâmetro na URL

- **Status:** Decidida em 02/11/2026, por Felipe Guedes.
- **Decisão:** na agenda, o agendamento abre por cima da grade, com `?agendamento=<id>&aba=mensagens|historico`, sem perder semana, filtros nem data. Em cima ficam a próxima ação, Remarcar e o menu com as outras; dados, mensagens e histórico viram abas. Depois de agendar ou remarcar, a pessoa volta à agenda naquele dia, com o agendamento aberto.
- **Como fica no código:** a página da agenda lê o agendamento antes de responder, então id inválido dá 404 com o status certo (D-72), sem `<Suspense>` nem rota paralela. `/agendamentos/[id]` continua, com o mesmo conteúdo, para o que aponta de fora da agenda: Pendências, ficha do paciente, evento do Google e aviso do celular.
- **Motivo:** clicar num agendamento saía da agenda, e voltar caía na visão Dia, perdendo a semana.
- **No PRD:** seção 11.

### D-84 · Pendências: lista única do que espera alguém

- **Status:** Decidida em 02/11/2026, por Felipe Guedes.
- **Decisão:** `/pendencias` junta numa lista, por data, Sem confirmação, as respostas do paciente, as mudanças e os conflitos do Google e Sem baixa, com a ação na própria linha e filtros por motivo. O menu mostra o total. O profissional vê só as linhas do Google da própria agenda. As telas `/sem-confirmacao` e `/google` saem.
- **Muda:**
  - D-13: Sem baixa deixa de ser lista dentro da Lista do dia, que mantém um aviso com link.
  - D-64: mudanças e conflitos do Google ficam nesta lista.
  - D-75: o tempo da secretária conta enquanto a tela mostra agendamentos Sem confirmação, seja no filtro deles ou em Todas. Como ainda não havia linha de base em produção, a meta da seção 8 não muda.
- **Motivo:** o que estava pendente ficava em 3 lugares, sem contador, e era preciso entrar em cada um para saber.
- **No PRD:** seções 4, 5, 8 e 11.

### D-85 · Bloqueio manual e o evento "Bloqueado" no Google

- **Status:** Decidida em 02/11/2026, por Felipe Guedes, ao aprovar a proposta.
- **Decisão:**
  - Secretária, gestor e admin bloqueiam qualquer agenda; o profissional, a própria, também pela aba Bloquear da PWA. O motivo é obrigatório e fica na agenda.
  - Sobre um agendamento existente, o sistema avisa e deixa salvar, sem cancelar nada, como no conflito com o Google (D-64).
  - O bloqueio vai ao calendário secundário do profissional como "Bloqueado", sem o motivo. Era o "vice-versa" da seção 1, que a tabela da seção 5 não trazia.
  - Só o bloqueio manual é editado ou removido aqui; o que veio do Google muda no Google. O evento "Bloqueado" é saída: mexer nele no Google não volta para a agenda.
- **Como fica no código:** `src/lib/agenda/time-blocks.ts`, com a marca de exportação em `TimeBlock`, como no agendamento (D-62). Bloqueio removido que tem evento fica com `deletedAt` até o evento sair do Google; toda leitura de bloqueio filtra `deletedAt: null`.
- **Motivo:** a seção 3 dava isso à secretária e ao profissional, mas nenhuma tela criava bloqueio.
- **No PRD:** seções 4, 5 e 11.

### D-86 · Telas de Unidades e horários

- **Status:** Decidida em 02/11/2026, por Felipe Guedes.
- **Decisão:** `/unidades` e `/unidades/horarios`, para gestor e admin (`practice-settings:edit`). Unidade tem nome, endereço, fuso e situação; a última ativa não pode ser desativada, porque o fuso da agenda vem da primeira ativa (D-41). Horário é por profissional e dia, com um ou mais intervalos, que não se cruzam. Exceção é de dias inteiros; "todos os profissionais" grava uma linha para cada um, porque o modelo é por profissional.
- **Como fica no código:** `src/lib/locations/locations.ts`. Adicionar um intervalo numa unidade liga o profissional a ela (`ProfessionalLocation`), que é o que o novo agendamento pede. Remover o intervalo não desfaz a ligação, para não invalidar agendamentos. Mudar o fuso replaneja a régua da unidade.
- **Depois:** a tela para criar profissional e desfazer a ligação com a unidade veio na D-91.
- **No PRD:** seção 11.

### D-87 · Trilha de auditoria na tela

- **Status:** Decidida em 02/11/2026, por Felipe Guedes.
- **Decisão:** `/auditoria`, para gestor e admin, com quando, quem, o que aconteceu, onde e quais campos mudaram, e filtros por período, pessoa e área. Nunca mostra o valor de um campo (D-28). O nome da entidade é lido na hora, então quem pediu exclusão aparece como "Paciente excluído".
- **Como fica no código:** `src/lib/audit`. Ação nova precisa de rótulo em `labels.ts`; `labels.test.ts` varre o código e falha se faltar.
- **No PRD:** seções 3 e 11.

### D-88 · Esqueci minha senha

- **Status:** Decidida em 02/11/2026, por Felipe Guedes, ao aprovar a proposta.
- **Decisão:** `/esqueci-senha` e `/nova-senha`, pelo Better Auth e pelo `authClient`, para passar pelo limite de tentativas. A resposta é a mesma exista ou não a conta. O link vale por 1 hora e só uma vez. Salvar a senha encerra as outras sessões, e o 2FA continua sendo pedido no login.
- **E-mail:** sai pelo provedor da D-90, depois da resposta, para o tempo não revelar se a conta existe. Por isso a tela diz a mesma coisa quando o envio falha, e a falha fica só no log do servidor.
- **No PRD:** seção 3.

### D-89 · Cadastro de paciente na tela Pacientes

- **Status:** Decidida em 02/11/2026, por Felipe Guedes.
- **Decisão:** Adicionar paciente, em painel sobre a lista, com os dados e o serviço do cadastro rápido (D-22, D-47), que continua no agendamento. "Salvar e agendar" leva ao novo agendamento com o paciente escolhido. Celular repetido avisa e abre o cadastro existente. A lista busca enquanto a pessoa digita e traz Agendar na linha.
- **No PRD:** seção 11.

### D-90 · Gmail como provedor de e-mail

- **Status:** Decidida em 03/11/2026, por Felipe Guedes. **Envio real validado no mesmo dia:** `npm run email:teste`, com uma conta Workspace de Felipe, e a mensagem chegou à caixa de entrada (relato de Felipe). Convite, link do Google e senha esquecida usam o mesmo envio, mas nenhum deles saiu de verdade. Produção ainda não está configurada.
- **Decisão:** com `EMAIL_PROVIDER="gmail"`, os e-mails do sistema (convite, link do Google, aviso de instância desconectada e senha esquecida) saem pelo Gmail, por SMTP (`smtp.gmail.com`, porta 465), com `GMAIL_USER` e a senha de app em `GMAIL_APP_PASSWORD`. Sem `EMAIL_PROVIDER`, vale o que a D-38 dizia: terminal em desenvolvimento, recusa em produção. Valor desconhecido é recusado em qualquer ambiente, porque no teste um valor errado parecia envio e só saía no terminal.
- **Como fica no código:** `src/lib/email/gmail.ts`, com o `nodemailer` 10.1.7 fixado e carregado só ao enviar. Fora de produção, só alcança `EMAIL_ALLOWED_RECIPIENTS`, como os outros provedores reais; em produção, a lista é opcional. Testes e e2e forçam o terminal, seja qual for o `.env`.
- **Para ligar:**
  1. Na conta Google que vai enviar, ligar a verificação em duas etapas e criar uma senha de app. Em conta Workspace, o administrador precisa permitir.
  2. Preencher as variáveis no `.env` e conferir com `npm run email:teste -- --para voce@exemplo.com`, com esse endereço em `EMAIL_ALLOWED_RECIPIENTS`.
  3. Preencher as mesmas variáveis em produção.
- **Limite:** o Gmail limita os envios por dia, e o limite depende do tipo de conta. Para o volume de convites e senhas esquecidas não deve pesar, mas a régua não passa por aqui.
- **Motivo:** a D-38 deixou o provedor em aberto, e sem ele nem o convite nem a senha esquecida funcionam em produção.
- **No PRD:** seção 3.

### D-91 · Cadastro de profissional e ligação com as unidades

- **Status:** Decidida em 03/11/2026, por Felipe Guedes.
- **Decisão:**
  - Em Profissionais, o gestor e o admin adicionam um profissional com nome e unidades, renomeiam, ligam e desligam unidades e desativam.
  - Nome não se repete na conta, sem diferenciar maiúsculas.
  - Desligar de uma unidade apaga os horários e as exceções dela, e é recusado com agendamento pela frente nessa unidade. O profissional fica sempre com pelo menos uma.
  - Profissional nunca é apagado, porque os agendamentos passados apontam para ele. Sair é desativar, o que também é recusado com agendamento pela frente. Desativado, sai da agenda e do novo agendamento, e continua na lista para poder voltar.
  - O login continua vindo do convite que aponta o cadastro (D-38), que só o admin faz para profissional. A tela diz isso a quem é gestor.
- **Como fica no código:** `src/lib/professionals/professionals.ts`.
- **Motivo:** o convite de profissional exige um cadastro que nenhuma tela criava.
- **No PRD:** seção 11.

### D-92 · Nenhuma tela espera o Inngest

- **Status:** Decidida em 03/11/2026, por Felipe Guedes.
- **Problema:** os pedidos ao Inngest esperavam a resposta. Com o Inngest fora do ar, o cliente tenta de novo por cerca de 2 s, e Confirmar demorava isso a mais.
- **Decisão:** `sendWithoutWaiting`, de `src/lib/inngest/client.ts`: o evento sai sem segurar quem pediu, e `after` o mantém vivo depois da resposta nas plataformas que encerrariam ali. Cada evento é só um aviso: o tick e a leitura periódica acham o trabalho de qualquer jeito. Um teste varre o código e falha se alguém esperar `inngest.send`.
- **No PRD:** sem mudança; o limite da seção 7 continua valendo pelo tick.

## Bloco 9 em 03/11/2026

Decisões tomadas para deixar o código publicável na Vercel com Supabase. Nada foi publicado e nenhuma conta foi criada: a ordem do primeiro deploy e o que ainda não foi testado estão em `docs/publicacao.md`.

### D-93 · Primeira conta: comando do operador

- **Status:** Decidida em 03/11/2026.
- **Problema:** usuário só nasce por convite, convite só sai de quem já tem acesso, e só o seed criava organização e conta. Num banco vazio ninguém entrava.
- **Decisão** (`src/lib/operator/first-account.ts`, `npm run conta:criar`):
  - O comando cria a organização, a conta, a primeira unidade (o fuso da agenda vem dela, D-41) e o convite do primeiro admin, numa transação, com auditoria de ator `SYSTEM`. O convite é o de sempre (D-38): 7 dias, uso único, só o SHA-256 no banco.
  - **`Invitation.organizationAdmin`:** o papel do convite é da conta, e admin da organização não é um desses papéis. O aceite dessa marca cria também o `OrganizationMember`, com auditoria `organization_admin.added`. O convidado fica ainda com a alocação de gestor, porque o aviso de instância desconectada vai para os gestores da conta (D-54). Nenhuma tela emite esse convite.
  - **E-mail que não sai:** o convite fica e o link aparece no terminal. Ninguém mais alcança uma conta sem ninguém, e quem roda o comando já tem o banco.
  - **Organização repetida** é recusada, sem diferenciar maiúsculas, para um erro de digitação não criar uma gêmea. `--acrescentar` põe mais uma conta numa organização existente, que o admin dela vê na hora, já que nenhuma tela cria conta.
  - **Convite vencido:** `--reconvidar` emite outro e cancela o pendente, só enquanto a organização não tem admin ativo. Depois disso quem convida é o admin, pela tela, e um erro de digitação aqui nunca cria um admin.
- **Motivo:** sem isso o sistema não abre em produção, e o seed da demo não pode rodar lá (D-98).
- **No PRD:** seção 3 (requisito 3).

### D-94 · Instância de WhatsApp na tela do profissional

- **Status:** Decidida em 03/11/2026.
- **Decisão** (`src/lib/cadence/instance-setup.ts`, seção WhatsApp de `/profissionais/[id]`):
  - Gestor e admin (`practice-settings:edit`) informam a URL e o token da instância e o número conectado. O QR Code continua no painel da WhatsAPI, e `npm run whatsapi:setup` fica só para desenvolvimento: agora recusa banco remoto.
  - **Antes de salvar,** com o provedor real, o token é testado em `GET /instance/status`. Token recusado ou WhatsAPI fora do ar não salvam nada: o erro aparece aqui, e não como uma régua que não sai.
  - **Token** só criptografado (`encryptSecret`), e a tela nunca o devolve. Em branco, continua o salvo.
  - **Webhook:** `configureWebhook` aponta para `PUBLIC_WEBHOOK_URL/api/webhooks/whatsapi/[id]`. Sem endereço público HTTPS, nada é salvo, porque a régua perguntaria e nunca ouviria a resposta (D-05). Se só o webhook falhar, o resto fica, a tela avisa, e salvar de novo tenta outra vez.
  - **Número:** nada gravava `WhatsappInstance.phoneNumber`, de que a nota na conversa depende (D-73). Numa instância real, nenhuma nota iria para a conversa. Passa a ser obrigatório, por `normalizePhone`.
  - **URL:** só HTTPS, com nome público; endereço IP, `localhost`, nomes internos e credenciais na URL são recusados, porque o servidor chama esse endereço levando o token. **Limite:** um nome público que aponte para um endereço privado passa por essa conferência.
  - Os disparos planejados sem instância passam a apontar para a nova (D-53). Auditoria `whatsapp_instance.registered` e `whatsapp_instance.updated`, só com nomes de campos.
- **Limite:** o `GET /instance/status` e o `POST /webhook` da uazapi já foram exercitados na D-57, mas este caminho só rodou com a WhatsAPI simulada.
- **No PRD:** seção 3 (requisito 9), seção 11.

### D-95 · Preview não é produção

- **Status:** Decidida em 03/11/2026.
- **Problema:** a Vercel põe `NODE_ENV=production` também no preview. Quem decidia pelo `NODE_ENV` tratava um preview como produção: provedores reais, sem lista de permitidos.
- **Decisão** (`src/lib/env.ts`):
  - `isProduction()`: com `VERCEL_ENV` definido, vale ele; sem ele, `NODE_ENV`. Mensagens, Google, CRM, Web Push e e-mail perguntam aqui. Preview usa o sandbox por padrão, e um provedor real ligado só alcança a lista de permitidos.
  - `requiresRealProviders()` junta a regra de produção com a exceção do banco `*_test` (D-46, D-66), que antes estava em dois módulos e agora vale para os quatro provedores.
  - `NODE_ENV` continua decidindo o que é do build, como cookie seguro: preview também é HTTPS.
  - `appBaseUrl()` e `appOrigins()`: preview não tem endereço conhecido de antemão, então, sem `BETTER_AUTH_URL`, vale o do ramo, que sobrevive a novos pushes. O login aceita também o endereço do deploy.
- **Limite:** nada disso protege o banco. Preview com a `DATABASE_URL` de produção leria dados reais; `docs/publicacao.md` manda separar por ambiente.
- **No PRD:** seção 12 (Deploy).

### D-96 · Limite de tentativas no banco

- **Status:** Decidida em 03/11/2026.
- **Decisão:** `rateLimit: { storage: "database", modelName: "rateLimit" }`, modelo `RateLimit` (`key`, `count`, `lastRequest` em `BigInt`), conferido no código publicado da versão 1.7.14. O contador em memória nasce e morre com cada instância serverless. As regras são as do Better Auth: 3 logins a cada 10 s por endereço, as do plugin de 2FA e 3 pedidos de senha por minuto. A contagem é atômica (`incrementOne`), e dois processos enxergam o mesmo contador: o teste usa dois clientes como duas instâncias.
- **`/get-session` fica de fora** (`customRules`): a PWA consulta a cada minuto (D-76), e cada contagem são duas consultas ao banco.
- **Dado pessoal:** a chave é `endereço|caminho`. O próprio Better Auth apaga as linhas de janelas passadas sempre que uma janela vence, então o endereço fica cerca de um minuto, ou até o próximo login. Entrou em `CROSS_PRACTICE_MODELS`.
- **Conferido no build de produção:** depois do e2e, a linha no `agenda_test` tem endereço na chave, e nenhuma tem `no-trusted-ip`. Endereço IPv6 entra por sub-rede /64, o padrão da versão, então quem divide uma rede IPv6 divide o limite.
- **Na Vercel:** o Better Auth 1.7.14 só confia em `x-forwarded-for` com um único valor e, sem endereço, cai num balde único por caminho, que seria dividido por todos. A Vercel sobrescreve esse cabeçalho com o endereço do cliente, então deve vir um só. Não testado em ambiente real: `docs/publicacao.md` manda conferir na primeira publicação se a chave traz um endereço, e não `no-trusted-ip`.
- **No PRD:** seção 7 (Segurança).

### D-97 · Banco e deploy

- **Status:** Decidida em 03/11/2026.
- **Decisão** (`src/lib/db/connection.ts`, `vercel.json`, `package.json`):
  - **Duas URLs:** `DATABASE_URL` é a da aplicação: no Supabase, o transaction pooler (porta 6543). `DIRECT_URL` é a das migrações: session pooler (5432) ou conexão direta, porque o `prisma migrate` segura um advisory lock pela sessão. `npm run db:deploy` recusa o transaction pooler antes de o Prisma tentar. Conexão direta no Supabase é só IPv6 sem o add-on, e o build da Vercel é IPv4: use o session pooler.
  - **Prepared statements:** o transaction pooler não aceita, e o `@prisma/adapter-pg` não dá nome a nenhum sem `statementNameGenerator` (conferido no código publicado). Por isso não há `pgbouncer=true` nem parâmetro parecido.
  - **Pool, só em banco remoto:** `max` 5 (`DATABASE_POOL_MAX`, nunca menos de 2), `idleTimeoutMillis` 5 s, como a Vercel recomenda, e `connectionTimeoutMillis` 10 s, em vez de esperar para sempre. Fora daí valem os padrões do `pg`. Com 1, uma consulta feita enquanto uma transação segura a única conexão esperaria para sempre. `attachDatabasePool` (`@vercel/functions`) fica para quando aparecer falta de conexão: é uma dependência a mais para um risco que o piloto não deve alcançar.
  - **TLS:** sem configuração, o `pg` conectaria em texto puro num banco remoto. Com `DATABASE_CA_CERT`, o servidor é verificado; só `sslmode` escrito na URL, por decisão de quem configura, é a alternativa, e `disable` é recusado. Sem nenhum dos dois, o sistema não sobe. O `sslmode` da URL substituiria o certificado dentro do `pg`, então é retirado: um teste confere pela própria `ConnectionParameters`.
  - **Data API do Supabase:** publica o esquema `public` para `anon`, `authenticated` e `service_role`, e tabela nova nasce com permissão para eles. Sem RLS (D-02), bastaria a chave pública do projeto para ler todas as contas. A primeira barreira é desligar a Data API (`docs/publicacao.md`). A segunda é a migração `close_supabase_data_api`, que tira as permissões atuais e as padrão, quando esses papéis existem, e fica valendo se alguém religar a API.
  - **Fluxo:** `vercel.json` manda rodar `npm run vercel:build`, que é `next build && npm run db:deploy`: build quebrado não migra. **Por isso, migração tem de ser compatível com a versão no ar**, que segue atendendo até o deploy novo assumir.
  - **Região:** `gru1`, a de São Paulo na lista de regiões da Vercel, conferida em 03/11/2026. O padrão seria `iad1`, em Washington. O banco fica em `sa-east-1`.
  - **Node:** `engines.node` `24.x` e `.nvmrc` `24`, a versão em que o projeto roda. O padrão da Vercel já é o 26.
  - `maxDuration` de 300 s em `/api/inngest`, porque cada job é uma requisição.
  - **Tamanho:** no build local, a função mais pesada soma 23,6 MB e a do Inngest, 22,4 MB, pelos arquivos que o Next rastreia, contra o limite de 250 MB da Vercel. O `googleapis` de 246 MB (D-58) não pesa, porque só o módulo do Calendar é importado.
- **Conferido na imagem oficial do Postgres do Supabase** (17.11.0.004, contêiner descartável, removido no fim), com o usuário `postgres`, que lá não é superusuário. Antes da migração, uma tabela nova nascia com `SELECT` para `anon` e `INSERT` para `authenticated`: a exposição é real. Depois de `npm run db:deploy`: 49 tabelas, 29 triggers de conta imutável, `unaccent` funcionando pelo trigger de `searchName`, trilha recusando `UPDATE`, nenhuma tabela com `SELECT`, `INSERT` ou `TRUNCATE` para `anon`, nem `SELECT` para `authenticated` e `service_role`, inclusive tabela criada depois da migração; o `postgres` segue com as 49. O `npm run conta:criar` criou a conta com a auditoria.
- **Limite:** nada disso rodou num transaction pooler de verdade, nem com o certificado do Supabase, nem num projeto hospedado. Ver `docs/publicacao.md`.
- **No PRD:** seção 7 (Isolamento), seção 12 (Deploy).

### D-98 · Seed e comandos destrutivos só neste computador

- **Status:** Decidida em 03/11/2026.
- **Decisão:** `assertLocalDatabase`: `prisma/seed.ts` só roda fora de produção e com `DATABASE_URL` e `DIRECT_URL` em `localhost`, `127.0.0.1` ou `::1`, antes de carregar o cliente do banco. Olhar só o ambiente não bastaria: um `.env` copiado de produção deixa `NODE_ENV` vazio e aponta para o banco real.
- **Além do pedido:** `db:reset` e `db:migrate` passam pela mesma trava, em `scripts/assert-local-database.ts`. O `prisma migrate reset --force` esvaziaria o banco antes de o seed recusar.
- **Limite:** preview com banco na nuvem não recebe a demo. A conta de teste vem do `npm run conta:criar` (D-93).
- **No PRD:** sem mudança; o PRD não trata do seed em produção.

### D-99 · Página inicial e política de privacidade

- **Status:** Decidida em 03/11/2026. **Texto provisório**, como `/termos` (D-38): o texto jurídico e o canal de contato ainda não existem, e a verificação do Google vai pedir esse contato.
- **Decisão:**
  - `/` sem cookie de sessão mostra a página inicial, por rewrite no `proxy.ts` para `/inicio`, e não mais o login: a verificação abre o endereço sem login. Com cookie, segue para a escolha de conta, como antes. Sem cadastro aberto (D-38).
  - `/privacidade` descreve o que o sistema faz, como o PRD e as decisões dizem: dados tratados, base legal (D-19), o uso dos dados do Google, com a frase de Uso Limitado que a política do Google pede, operadores e direitos do titular (D-49). Não inventa contato, encarregado nem posição jurídica nova.
  - As telas de acesso ganham o link para Privacidade e Termos.
- **No PRD:** seção 7 (LGPD), seção 11.

### D-100 · Execuções do Inngest: a conta

- **Status:** Decidida em 03/11/2026. Em 04/11/2026, Felipe Guedes decidiu começar no plano gratuito (ver abaixo).
- **Preço, conferido em inngest.com/pricing em 03/11/2026:** uma execução é um run ou um passo; executions = runs × (passos + 1). Free: 50 mil por mês, e **a execução pausa ao chegar à cota**, o que pararia a régua. Pro: a partir de US$ 99 por mês, com 1 milhão, e US$ 50 por milhão a mais. A página não diz com todas as letras que um run sem passos conta 1: é o que a fórmula dá.
- **Com o sistema parado, em 30 dias:**

  | Função | Runs | Execuções por run | Antes | Depois |
  | --- | --- | --- | --- | --- |
  | 4 ticks de minuto | 43.200 cada | 2 | 345.600 | um só, sem passo: 43.200 |
  | Leitura do Google, 4 min | 10.800 | 2 | 21.600 | dentro do tick: 0 |
  | Conexão das instâncias, 5 min | 8.640 | 2 | 17.280 | dentro do tick: 0 |
  | Diário do Google | 30 | 3 | 90 | 30 |
  | Diários do CRM e da limpeza | 60 | 2 | 120 | 60 |
  | **Total** | | | **384.690** | **43.290** |

- **O que mudou** (`src/lib/inngest/tick.ts`, `functions.ts`):
  - Um tick por minuto faz o que 5 crons faziam, e a cada 4 e 5 min, pelo minuto, faz o que os outros dois faziam. Uma fila que falha não para as outras. O envio dos eventos vem antes da conferência das instâncias, que agora correm juntas: a que não responde leva 15 s e não segura nada.
  - Função com um trabalho só não tem passo: o passo dobrava a conta e repetia a mesma coisa em caso de erro. Só a drenagem tem, para guardar os 8 s entre mensagens.
  - A drenagem olha se há mais um disparo vencido antes de esperar os 8 s: uma mensagem sozinha na fila custa 2 execuções, em vez de 4.
- **As metas continuam:** cada fila é lida com a mesma frequência. Janela e margem (D-07) saem pelo tick de minuto; a leitura do Google segue a cada 4 min (D-61); os eventos continuam indo por `sendWithoutWaiting` (D-92), com o tick como rede de segurança. O teste `tick.test.ts` soma os crons e falha acima de 45 mil.
- **Com uso, estimativa, não medição:** por mês, 10.800 execuções para cada vínculo Google (antes, 21.600), mais cerca de 20 por atendimento (antes, cerca de 40). Com 6 profissionais, 20 atendimentos por dia cada e 22 dias úteis: 43 mil parado, 65 mil de leitura e 53 mil de atendimentos, **cerca de 160 mil por mês**, contra cerca de 620 mil antes. Cada profissional assim soma perto de 20 mil. **O plano gratuito não comporta o piloto, e o Pro comporta perto de 47 profissionais.**
- **Começa no plano gratuito, e o Pro entra antes do piloto:**
  - Cabem a publicação e os testes. Parado, o sistema gasta 43.290 das 50 mil, e sobram 6.710 por mês.
  - **O piloto não cabe.** Um vínculo Google sozinho, com 10.800 por mês, leva à cota em cerca de 28 dias. Com a conta acima, de 6 profissionais, ela acaba em cerca de 9 dias.
  - **Na cota, a execução pausa e só volta com o upgrade** ("you'll need to upgrade to resume", na página de preços, conferida em 04/11/2026). Régua, exportações e avisos param. A página não diz o que acontece com o que estava na fila, nem se há aviso antes. O upgrade vale na hora.
  - A agenda continua de pé, porque nenhuma tela espera o Inngest (D-92) e a resposta do paciente é tratada dentro do webhook (D-51). **Nada no sistema avisa dessa pausa:** o uso se confere no painel do Inngest.
- **O que não foi feito:**
  - **Parar à noite:** a janela de envio é por conta e por fuso, e o limite de 5 min da seção 7 não tem horário.
  - **Ler menos quem tem push ativo:** cortaria perto de 80% do custo por vínculo, mas os 5 min passariam a depender do push do Google. Muda a seção 7, e é decisão de Felipe se o custo pesar.
- **No PRD:** seção 12 (Jobs e filas).

### D-101 · Observabilidade sem serviço de fora

- **Status:** Decidida em 03/11/2026. Um rastreador de erros, como o Sentry, fica como próximo passo: precisa de conta e entra na lista de operadores (PRD 7, LGPD).
- **O que faltava:** a entrega de WhatsApp e as falhas do Google já estavam no painel da D-74. Faltavam os erros, os motivos das falhas e as filas, e não havia nada entre organizações.
- **Decisão:**
  - **`/saude`,** em Configurações, para gestor e admin (`reports:practice`): entrega de WhatsApp e falhas do Google, nas contas da D-74; motivos das mensagens que não saíram; instâncias conectadas; filas e falhas do Google e do CRM; e erros do sistema por rota. O admin vê também a tabela por conta da organização, lida conta a conta (D-75).
  - **`npm run operador:saude`:** a mesma leitura para todas as organizações, para quem opera. Nenhum papel da tela cruza organizações, e por isso não virou tela.
  - **`ServerError`,** por conta (`practiceId`, chave composta, trigger, D-30): erro do servidor, por `onRequestError` em `src/instrumentation.ts`, e job que desistiu, por `inngest/function.failed`. **Guarda onde e de que tipo, nunca a mensagem,** que pode trazer dado de paciente (D-28), e nunca a query. O nome do erro só entra se for um identificador. Redirect, 404 e 403 são a forma de o Next responder e ficam de fora. Sai depois de 90 dias, na limpeza diária.
  - **Conferido no build de produção** (`e2e/primeira-conta.spec.ts`, `e2e/status.spec.ts`): um fuso que o `Intl` não conhece derruba a agenda com 500, a linha entra no painel sem o texto do erro, e os 403, 404 e 307 não geram linha nenhuma. O `inngest/function.failed` não rodou com o Inngest de verdade.
  - **O erro inteiro** fica no log da Vercel, como o Next imprime. Erro fora de uma conta, como no `/login`, só aparece lá. **Limite:** esse log pode ter dado pessoal, e sua retenção é a da Vercel.
  - **`/api/health`:** responde 200 ou 503 conforme o banco responde, sem dizer por quê, para um monitor externo medir os 99,5% da seção 7. O monitor precisa de conta e não foi criado.
- **No PRD:** seção 7 (Observabilidade, Disponibilidade), seção 11.

### D-102 · Cabeçalhos de segurança

- **Status:** Decidida em 03/11/2026.
- **Decisão** (`src/lib/security/headers.ts`):
  - **CSP com nonce,** em `src/proxy.ts`, novo a cada resposta, como o guia do Next ensina: `script-src 'self' 'nonce-…' 'strict-dynamic'`. Um script injetado não roda, mesmo numa falha de escape, e `connect-src 'self'` deixa os dados sem para onde ir. Estilos inline ficam permitidos, porque Radix e os atributos `style` usam. `form-action` aceita `accounts.google.com`, porque "Vincular Google Agenda" termina na tela do Google.
  - **`proxy.ts`** segue sem banco e sem papel (D-40): só gera o nonce e olha o cookie.
  - **Toda página passa a ser dinâmica,** por `connection()` no layout raiz: página pronta de antemão teria scripts sem o nonce, e o navegador os recusaria. Só `/termos` e `/google/sandbox` eram estáticas (D-72).
  - **Em toda resposta,** em `next.config.ts`: `Strict-Transport-Security` sem `includeSubDomains`, porque o domínio pode dividir o pai com outros sites; `X-Content-Type-Options`; `X-Frame-Options`; `Referrer-Policy`, porque links de convite e de senha levam token no caminho; `Permissions-Policy`, que deixa os avisos da PWA de fora; e sem `X-Powered-By`. O `/sw.js` mantém a política própria (D-76).
- **Conferido no build de produção** (`e2e/publicas.spec.ts`): script inline, handler `onerror` e script de outro domínio escritos no HTML da resposta são recusados, e a tela continua respondendo.
- **Limite:** com `'strict-dynamic'`, um script que já está rodando pode criar outros, inclusive inline. É assim de propósito, e o Chromium faz isso: a política barra o que entra pelo HTML, não o que um script confiável decide criar. A primeira versão do teste criava o script por `createElement` e falhou por isso. O toolbar da Vercel em preview vem de outro domínio e deve ser recusado, sem efeito na página. A ida real ao Google não rodou com esta política: só o sandbox.
- **No PRD:** seção 7 (Segurança).

### D-103 · Backup de 7 dias no piloto

- **Status:** Decidida em 04/11/2026, por Felipe Guedes, entre os caminhos levados a ele. A proposta era o caminho A.
- **Problema:** a seção 7 pedia backup diário, retenção de 30 dias e restauração testada por trimestre. O Supabase Pro guarda 7 dias.
- **Decisão:** no piloto vale o backup diário do Supabase Pro, com 7 dias de retenção, sem job, armazenamento nem operador novos. A meta de 30 dias volta ao sair do piloto, no Gate 1 (seção 9), e aí se escolhe entre os caminhos abaixo.
- **O que fica aceito:**
  - Um erro percebido depois de 7 dias não tem volta.
  - Entre dois backups, perde-se até um dia de dados.
  - Não há cópia fora do Supabase: um problema na conta ou no projeto pode alcançar o banco e os backups juntos.
- **Restauração:** continua testada por trimestre, em **Restore to a New Project**, porque restaurar no próprio projeto o deixa fora do ar. Pede plano pago e backup físico, que todo projeto em Postgres recente já usa. O projeto novo não mexe no original, nasce na mesma região e traz dados reais: nenhum serviço aponta para ele, e ele é apagado ao fim do teste. Nenhuma restauração foi feita até agora. O passo está em `docs/publicacao.md`.
- **Caminhos, conferidos nas páginas do Supabase em 03/11/2026:**

  | Caminho | Retenção | Custo a mais por mês | O que pesa |
  | --- | --- | --- | --- |
  | A. Pro com cópia própria: `pg_dump` diário, criptografado, num armazenamento nosso | 30 dias, ou o que for | Centavos a poucos dólares de armazenamento | Precisa de quem rode o job e de um operador novo. A chave fica fora da nuvem. Sem restauração a um ponto no tempo |
  | B. Pro com PITR de 28 dias | 28 dias, restaura a qualquer segundo | Cerca de US$ 400, mais o compute Small | Não chega aos 30 dias; ligar o PITR para os backups diários |
  | C. Team | 14 dias | US$ 599 no lugar de US$ 25 | Não chega aos 30 dias |
  | D. Enterprise | Até 30 dias | Sob consulta | Fora de escala para o piloto |
  | **E. Baixar a meta do PRD para 7 dias no piloto (escolhido)** | 7 dias | Nada | Muda um requisito de lançamento |

- **Para quando a meta voltar:** o caminho A era a proposta, porque só ele chega aos 30 dias com custo de piloto. Rodaria num GitHub Action agendado, já que a Vercel não tem o `pg_dump`, e somaria aos 7 dias do Pro. Os preços precisam ser conferidos de novo nessa hora.
- **No PRD:** seção 7 (Backup).

### D-104 · Repositório público

- **Status:** Decidida em 04/11/2026, por Felipe Guedes, informado do que ficaria à vista. A proposta era o repositório privado.
- **Problema:** os documentos e um teste traziam dados reais dos testes: celular, e-mail, nome e servidor de instância, tamanho de uma conta real. A varredura de todo o histórico não achou segredo (`.env`, token, chave), mas esses dados estavam nos commits, e apagar depois de publicar não desfaz uma cópia.
- **Decisão:**
  - **Nenhum dado real em arquivo, teste, commit ou mensagem de commit:** número, e-mail, nome de cliente ou de pessoa atendida, servidor, tamanho de conta. Teste real registra o que mediu, não de quem. Os testes reais anteriores continuam descritos, sem esses dados.
  - **Bastidor de teste real também fica fora:** aqui entra o que se mediu e o que mudou. O registro completo dos testes anteriores fica em `historico-privado`.
  - **O histórico publicado começa num commit único.** O anterior fica só nesta máquina, na branch `historico-privado`, e as branches antigas também o têm. O `pre-push` local (`.git/hooks`, fora do repositório) recusa qualquer envio que contenha esse histórico. Branch nova sai da `main`.
  - **Nomes da demo e dos exemplos do PRD trocados,** porque só Felipe sabe se os antigos eram de clientes. Os mockups, que são privados, ainda mostram os antigos.
  - **Autor dos commits:** o e-mail `noreply` do GitHub, em `user.email` deste repositório.
  - **`.claude/` no `.gitignore`:** guarda configurações locais e worktrees.
- **Fica público, e foi aceito:** o PRD, com estratégia, concorrentes e fases; o desenho de segurança; estas decisões; as senhas de demonstração, porque o seed só roda num banco desta máquina (D-98).
- **O sistema não depende de o código ser secreto:** segredos só vêm de variável, sem valor padrão no código, e o `.env.example` só tem valores vazios ou locais.
- **Em aberto:** sem arquivo de licença, o código fica visível, mas ninguém recebe permissão de uso. Mudar isso é decisão de Felipe.
- **No PRD:** seção 7.

### D-105 · Check numa sessão na nuvem

- **Status:** Decidida em 05/11/2026, por Felipe Guedes, que pediu o `npm run check` numa sessão do Claude Code na nuvem e a preparação dela no repositório.
- **Problema:** o `npm run check` precisa do Postgres no Docker, além de lint, tipos e testes. No computador de desenvolvimento, o Docker caiu no meio de uma execução, e todos os testes de banco falharam por conexão.
- **Decisão:**
  - **O check pode rodar numa sessão na nuvem,** num contêiner descartável, com o Postgres 17 do `docker-compose.yml` e os provedores falsos. Nenhum segredo nem serviço real entra no ambiente. O `.env` nasce do `.env.example`, sem valores, porque `tests/setup-env.ts` fixa segredos e provedores.
  - **O ambiente `agendamentouna`** instala o Node, as dependências e o `.env` no Setup script. Esse script só roda quando o contêiner é criado e não pode deixar processo rodando, então o Docker e o Postgres sobem na sessão.
  - **A preparação na sessão é `scripts/cloud-setup.sh`,** rodado antes dos testes. Pode rodar de novo sem estragar nada. O que ele contorna na imagem:
    - O `PATH` traz o Node 22, e o shell da sessão não carrega o nvm. O Node do `.nvmrc` entra por links em `~/.local/bin`, que vem antes no `PATH`.
    - Não há systemd. O `dockerd` sobe à mão, com `setsid`.
    - O Postgres 16 da máquina fica parado. Vale o 17 do `docker-compose.yml`.
  - **Sessão que volta do ócio reinicia o contêiner:** os arquivos ficam, mas os processos não, e o Docker cai. O script roda de novo antes de qualquer teste. A instrução está no `CLAUDE.md`, seção "Sessão na nuvem (D-105)".
- **Medido em 05/11/2026,** no contêiner da sessão, levado de volta ao estado inicial:
  - Preparação do zero: 1 min 4 s, com o pacote do Node e a imagem do Postgres já baixados.
  - Nova execução, inclusive depois de o Docker ser derrubado à força ou de o contêiner reiniciar: de 32 s a 53 s.
  - Setup script do ambiente, rodado à mão do diretório de cima: 34 s.
  - `npm run check`: passou nas cinco rodadas, com 1.453 testes em 104 arquivos, de 2 min 10 s a 2 min 26 s.
- **Não testado:**
  - O Setup script numa sessão nova do ambiente `agendamentouna`.
  - O e2e e o `bench:search` na nuvem.
- **No PRD:** seção 12 (Práticas que aceleram).
