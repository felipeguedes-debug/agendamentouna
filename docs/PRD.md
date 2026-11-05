# PRD: Sistema de Agendamento de Consultas

Oct 27, 2026 · @Felipe Guedes

## 1. Visão geral

O produto é uma agenda de atendimentos para consultórios particulares, multiusuário por conta, com classificação de atendimento e valor em cada horário, sincronização de mão dupla com o Google Agenda de cada profissional e régua de lembretes por WhatsApp configurável pela própria operação. As conversas com o paciente vivem na SynkronosCRM; este sistema cuida do horário, do disparo e do status.

**Versão consolidada em 27/10/2026.** Incorpora as decisões de 20/10 (WhatsAPI por profissional, sem caixa de entrada, unidades, convênio simples, valor informativo, PWA, migração por planilha) e os [mockups das telas principais](https://claude.ai/artifact/5NFzJMmuTRwhMB5VPeEfmT). A seção 12 traz o plano de construção no Claude Code.

**Revisão de 27/10/2026.** Esta cópia aplica as decisões D-01 a D-28, registradas em `docs/decisoes.md` com o motivo de cada uma; os trechos alterados citam a decisão entre parênteses. Hoje não há itens pendentes. Se surgir algum, ele aparece marcado como **[Pendente]**, e o código segue a premissa provisória descrita em `docs/decisoes.md` até a decisão sair.

**Problema.** Consultórios particulares operam a agenda em três lugares ao mesmo tempo: o Google Agenda pessoal do médico, a planilha ou sistema da secretária e o WhatsApp onde o paciente confirma. O resultado é horário duplicado, falta sem aviso e nenhuma visão de quanto cada tipo de atendimento gera. Os sistemas do mercado (amigoapp, Feegow, iClinic) resolvem isso dentro de pacotes de gestão clínica completos, com prontuário e faturamento, o que pesa para quem só precisa de agenda bem operada.

**Objetivo.** Uma agenda enxuta, centrada em quem opera (secretária e gestor), onde cada horário já nasce com tipo, valor e régua de lembrete, e onde o profissional continua vendo tudo no Google Agenda que já usa.

**Para quem.**

| Perfil | O que precisa do sistema |
| --- | --- |
| Secretária (presencial ou remota) | Marcar, confirmar e reagendar rápido; ver agenda de vários profissionais numa tela; não precisar mandar lembrete na mão |
| Médico ou dentista | Agenda sincronizada no Google Agenda do celular; saber o que vem a seguir e o valor previsto do dia pela PWA |
| Gestor do consultório ou da operação de secretárias | Várias contas em um login, indicadores por conta, régua de lembrete padronizada e auditável |

**Fora de escopo.** Prontuário eletrônico, faturamento de convênio (TISS), emissão de nota fiscal, recebimento (Pix, link), estoque e caixa de entrada de WhatsApp (fica na SynkronosCRM). O sistema é de agenda particular; integrações com esses módulos entram no roadmap.

## 2. Benchmark: amigoapp, Feegow e iClinic

Os três são sistemas de gestão clínica completos onde a agenda é um módulo; nenhum deles entrega sincronização bidirecional com o Google Agenda nem régua de WhatsApp configurável por tipo de atendimento sem add-on ou integrador de terceiros. É nesse espaço que o produto se posiciona.

| Critério | [Amigo (amigoapp)](https://www.amigotech.com.br/) | [Feegow Clinic](https://feegowclinic.com.br/blog/lembrete-de-consulta) | [Afya iClinic](https://iclinic.com.br/funcionalidades/agenda-medica/) |
| --- | --- | --- | --- |
| Posicionamento | Plataforma all-in-one: agenda, prontuário, IA, contabilidade, CRM (Amigo Flow). Amigo One é o app do profissional autônomo | ERP de clínica: agenda, prontuário, TISS, financeiro, módulo de cobrança | Agenda + prontuário + financeiro por profissional; parte do grupo Afya |
| Preço público | Amigo One: R$ 69,90/mês ou R$ 699,90/ano (app). Amigo Clinic sob consulta | Sob consulta; SMS cobrado a R$ 0,12 por envio de 160 caracteres | R$ 99 (Starter), R$ 129 (Plus), R$ 169 (Pro), R$ 299 (Premium), por profissional/mês. WhatsApp só a partir do Plus |
| Tipos de atendimento e valores | Agenda personalizada; valores no módulo financeiro | Procedimentos cadastrados; eventos de mensagem podem ser limitados por procedimento, profissional, unidade e especialidade | Cadastro de procedimentos com cor, duração e valor por profissional |
| Google Agenda | Não documentado publicamente | Envia lembrete do evento como notificação no celular (mão única) | Sincroniza com Google e Apple Calendar, mas o suporte indica que é apenas para conferência (mão única) |
| WhatsApp | Confirmação automática por WhatsApp, SMS e e-mail. Lembrete em cadência (1, 2, 3 dias) com botões Sim/Não existe via integrador SM Click, que precisa de bot + POST na API do Amigo | Eventos configuráveis por intervalo em horas antes ou depois, filtrados por status; WhatsApp é serviço adicional da licença e SMS vira fallback em caso de erro | Lembretes e confirmações automáticos; status muda para confirmado ou cancelado pelo paciente; mensageria em pacotes por profissional (R$ 29,90 por 85 envios a R$ 149,90 por 600) |
| Multiusuário e contas | Delegação de tarefas e gestão de equipe (Clinic) | Permissões por usuário; usuário master da licença libera funções | Uma agenda por profissional; recepção e administradores não pagam licença; multiclínicas na gestão |

**O que copiar.**

- Confirmação que muda o status do agendamento sozinha (iClinic e Feegow): a secretária não digita nada.
- Eventos de mensagem com filtro por procedimento, profissional e status (Feegow): é a base de uma régua por tipo de atendimento.
- Procedimento com cor, duração e valor no cadastro (iClinic): o horário já nasce classificado.
- Lista de espera com encaixe quando abre vaga (iClinic e Amigo).

**Onde diferenciar.**

1. Google Agenda de mão dupla por usuário: bloqueio no Google vira bloqueio aqui e vice-versa. Nos três, o Google é espelho ou notificação.
2. Régua de WhatsApp nativa, sem add-on nem pacote de envio por profissional, com cadência diferente para consulta, procedimento e exame.
3. Conta com múltiplos consultórios e múltiplos profissionais num login só, pensada para operação de secretárias remotas, não só para a clínica.
4. Valor previsto do dia e do mês direto na agenda, sem passar por módulo financeiro.

Fontes abertas em 20/10/2026: [Amigo Tech](https://www.amigotech.com.br/), [Amigo One na App Store](https://apps.apple.com/br/app/amigo-one/id1606759945), [Integração SM Click + Amigoapp](https://docs.smclick.com.br/docs/amigoapp/), [Feegow: lembretes](https://feegowclinic.com.br/blog/lembrete-de-consulta), [Feegow: configurar eventos](https://ajuda.feegow.com/support/solutions/articles/67000197659-como-configurar-eventos-de-e-mail-e-sms-), [iClinic: agenda](https://iclinic.com.br/funcionalidades/agenda-medica/), [iClinic: preços](https://iclinic.com.br/precos/), [iClinic: sincronização](https://intercom.help/iclinic-bc30384852a6/pt-BR/articles/5215046-como-sincronizar-a-agenda-com-o-mac), [Zapfunil: comparativo de chatbots](https://zapfunil.com/comparativos/melhores-chatbots-para-clinicas-no-whatsapp).

## 3. Contas, usuários e permissões

O modelo é Organização > Conta (consultório) > Profissional, e um usuário pode estar alocado em várias contas com papéis diferentes em cada uma. Isso cobre tanto a clínica com três sócios quanto a operação de secretárias remotas que atende dez consultórios.

**Entidades.**

| Entidade | O que é | Exemplos |
| --- | --- | --- |
| Organização | Quem paga e administra. Dona das contas | Clínica Vida; operação de secretárias remotas |
| Conta | Um consultório com agenda, tipos de atendimento, valores e régua próprios; tem uma ou mais unidades | Consultório do Dr. Otávio; Clínica da Dra. Marina |
| Unidade | Endereço de atendimento dentro da conta, com fuso horário próprio (padrão America/Fortaleza); todo agendamento aponta para uma unidade (D-03) | Unidade Aldeota; Unidade Sul |
| Profissional | Quem atende, dentro de uma conta. Agenda própria, um Google Agenda vinculado e um canal de WhatsApp próprio (instância WhatsAPI); atende em uma ou mais unidades. O mesmo médico em duas contas são dois Profissionais, que podem apontar para o mesmo Usuário e o mesmo Vínculo Google (D-04) | Médico, dentista, enfermeira esteta |
| Vínculo Google | Autorização OAuth de uma conta Google, com refresh token criptografado; serve a todos os Profissionais da mesma pessoa (D-01, D-04) | Google Agenda do Dr. Otávio |
| Usuário | Pessoa que faz login. Recebe um papel por conta | Secretária, gestor, o próprio profissional |
| Paciente | Cadastro por conta (nome, celular, convênio, consentimento de contato). Não é usuário |  |

**Papéis por conta.**

| Papel | Agenda | Tipos e valores | Régua de WhatsApp | Usuários e Google Agenda | Relatórios |
| --- | --- | --- | --- | --- | --- |
| Admin da organização | Tudo, em todas as contas | Edita | Edita e cria templates | Convida, remove, aloca | Consolidado por conta |
| Gestor da conta | Tudo na conta | Edita | Edita | Convida secretárias; envia ao profissional o link de vínculo do Google, que ele mesmo autoriza (D-01) | Da conta |
| Secretária | Marca, remarca, confirma, cancela, bloqueia | Só visualiza | Dispara manual e vê log | Não | Do dia e da semana |
| Profissional | Vê a própria agenda; bloqueia horários; marca chegada; resolve as pendências do Google da própria agenda (D-10) | Vê os próprios | Vê o log dos próprios pacientes | Vincula o próprio Google Agenda | Dos próprios atendimentos |

O admin da organização tem tudo o que o gestor tem, em todas as contas da organização. Fora da tabela, as configurações da conta e a trilha de auditoria ficam com gestor e admin. Conta sem acesso responde como inexistente; tela sem permissão responde "sem permissão" (D-39, D-40).

**Requisitos.**

1. Um usuário pode ter papéis diferentes em contas diferentes (secretária na conta A, gestora na conta B).
2. Troca de conta sem logout, com seletor no topo e agenda multi-conta para quem tem permissão em mais de uma. A conta fica na URL, e a troca leva à mesma tela na outra conta quando o papel permite (D-39).
3. Quem esqueceu a senha recebe por e-mail, pelo Gmail (D-90), um link que vale por 1 hora e uma vez; a resposta é a mesma exista ou não a conta, e a senha nova encerra as outras sessões (D-88). Convite por e-mail ou WhatsApp com link de ativação, válido por 7 dias e de uso único; primeiro acesso exige senha e aceite dos termos. O gestor convida secretárias; o admin da organização convida qualquer papel. O convite por WhatsApp entra com o Bloco 5 (D-38). A primeira organização, a conta e o convite do primeiro admin saem de um comando de operador, porque num banco vazio ninguém convida (D-93).
4. Toda ação na agenda registra quem fez, quando e de qual conta (trilha de auditoria exposta ao gestor, com os nomes dos campos e nunca os valores, D-28, D-87).
5. Desligar um usuário remove o acesso na hora e mantém o histórico das ações dele.
6. Login com e-mail e senha e com Google. O login com Google pede só identidade (e-mail e perfil); o acesso ao Google Agenda é pedido num fluxo OAuth separado, no vínculo da seção 5 (D-01). Não há cadastro aberto: o Google só entra com e-mail que já recebeu convite (D-35).
7. 2FA opcional para qualquer usuário. Uma conta pode exigir 2FA dos seus usuários; se qualquer conta do usuário exigir, o login pede o segundo fator (D-16). Quem ainda não ativou precisa ativar antes de usar a agenda, e o segundo fator vale também no login com Google (D-36).
8. Conta com uma ou mais unidades já no MVP: o horário de atendimento do profissional é definido por unidade e o agendamento herda o endereço e o fuso dela nas mensagens.
9. Cada profissional tem a própria instância WhatsAPI dentro da conta: o gestor ou o admin registra na tela do profissional a URL, o token e o número, e o QR Code é lido no painel da WhatsAPI (D-94); o gestor vê o status da conexão de todas.

## 4. Agenda e tipos de atendimento

Cada horário nasce com um tipo de atendimento, e o tipo carrega categoria, duração, valor, cor e régua de lembrete. A secretária escolhe o tipo e o resto vem preenchido.

**Cadastro de tipo de atendimento (por conta).**

| Campo | Regra |
| --- | --- |
| Nome | Livre (ex.: Primeira consulta, Retorno, Botox, Ultrassom). Uso interno |
| Nome exibido | Nome usado no título do evento no Google Agenda e na variável {tipo} da régua. Padrão: a categoria (Consulta, Procedimento, Exame…), para não expor procedimento sensível fora do sistema (D-14) |
| Categoria | Consulta, Retorno, Procedimento, Exame, Teleconsulta, Bloqueio. Lista fixa, filtrável na agenda |
| Duração padrão | Em minutos; copiada para o agendamento na criação e editável nele (D-12) |
| Valor | Em R$; pode variar por profissional dentro da conta. Valor zero permitido (retorno, cortesia). Só informativo no MVP: não gera cobrança, Pix nem link. Copiado para o agendamento na criação: mudar o tipo não altera agendamentos existentes; no agendamento, só gestor ou admin ajusta o valor (D-12) |
| Cor | Uma por tipo, de uma paleta fixa; a categoria define a família de cores (D-42) |
| Preparo | Texto opcional enviado ao paciente (jejum, documentos, chegar antes) |
| Régua | Qual cadência de lembrete se aplica (seção 6) |
| Permite agendamento online | Sim ou não (fase 3, D-27) |

**Agendamento.** Campos obrigatórios: paciente (busca por nome ou celular, sem acento; cadastro rápido inline com nome, celular e convênio, D-45), profissional, unidade (pré-selecionada quando o profissional atende em uma só), tipo, data e hora. Opcionais: observação interna (não vai para o paciente nem para o Google), origem do lead (Instagram, indicação, site, outro) e convênio como campo simples de texto (padrão Particular; sem guia nem TISS). Status: Agendado > Confirmado > Chegou > Em atendimento > Atendido, com saídas Faltou, Cancelado pelo paciente, Cancelado pelo consultório e Reagendado (D-10). Reagendar cria um agendamento novo ligado ao original, que fica com status Reagendado (D-11); o novo mantém tipo, duração e valor (D-44). Toda mudança de status fica no histórico com autor e hora.

**Transições de status (D-11).**

| De | Para | Quem |
| --- | --- | --- |
| Agendado | Confirmado, Chegou, Faltou, Cancelado pelo paciente, Cancelado pelo consultório, Reagendado | Secretária e gestor; Chegou também pelo profissional; Confirmado e Cancelado pelo paciente também pela régua; Confirmado também pela secretária na SynkronosCRM (D-66) |
| Confirmado | Chegou, Faltou, Cancelado pelo paciente, Cancelado pelo consultório, Reagendado | Secretária e gestor; Chegou também pelo profissional; Cancelado pelo paciente também pela régua |
| Chegou | Em atendimento, Atendido | Secretária, gestor e profissional |
| Em atendimento | Atendido | Secretária, gestor e profissional |
| Atendido, Faltou, Cancelado pelo paciente, Cancelado pelo consultório | Outro desses status finais, como correção com motivo obrigatório | Só gestor ou admin |
| Reagendado | Nenhum: o agendamento novo segue o próprio fluxo | — |

**Visualizações.**

- Dia, semana e mês por profissional, com cores por tipo.
- Multiprofissional: colunas lado a lado no mesmo dia (até 8 sem rolagem horizontal). Visão, data e filtros ficam na URL (D-41).
- Lista do dia: ordem de atendimento, status, tipo e valor, com ação rápida de confirmar, marcar chegada e dar baixa.
- Sem baixa: agendamentos com horário já passado que seguem em Agendado, Confirmado, Chegou ou Em atendimento. Aparecem em Pendências a partir do fim do dia do atendimento, com aviso na lista do dia, até alguém dar baixa (Atendido, Faltou ou cancelamento) (D-13, D-84).
- Filtro por categoria, status e profissional, combináveis.
- Painel de valor previsto: valor previsto é a soma dos agendamentos do período visível que não foram cancelados nem reagendados (Agendado, Confirmado, Chegou, Em atendimento, Atendido e Faltou); valor realizado é a soma dos Atendidos. Sem módulo financeiro, só leitura (D-13).

**Regras de agenda.**

1. Horário de atendimento por profissional, unidade e dia da semana, com intervalos e exceções (feriados, férias) (D-04).
2. Bloqueio manual com motivo; sobre um agendamento, avisa e não cancela nada (D-85). Bloqueio vindo do Google Agenda aparece com ícone próprio e só muda no Google (seção 5).
3. Conflito de horário bloqueado por padrão; gestor pode liberar encaixe com aviso. Horário de atendimento é informativo e não bloqueia o agendamento (D-43).
4. Lista de espera por profissional e tipo; quando um horário libera, o sistema sugere o primeiro da lista e permite disparar convite por WhatsApp (fase 2, D-21).
5. Recorrência simples (semanal, quinzenal, mensal, N vezes) para acompanhamentos (fora do MVP, ainda sem fase, D-21).
6. Reagendar cria um agendamento novo ligado ao original, mantém o histórico do horário original e reinicia a régua de lembrete no agendamento novo (D-11).
7. Busca global por paciente mostra todos os agendamentos dele na conta (tela Pacientes, D-50).
8. Datas e horas ficam em UTC no banco; exibição, janela de envio e passos da régua seguem o fuso da unidade (D-03).
9. Importação por planilha (MVP): pacientes são deduplicados pelo celular dentro da conta; agendamentos futuros importados entram com a régua desligada, com ativação em lote pelo gestor, e são exportados para o Google Agenda (D-18), logo na importação ou na primeira sincronização do profissional (D-62). Formato, colunas, limites e relatório de erros por linha na D-48.

## 5. Integração com o Google Agenda

A sincronização é de mão dupla, por profissional, com o sistema como fonte da verdade para atendimentos e o Google como fonte da verdade para compromissos pessoais. É o ponto onde os três concorrentes param no espelho de mão única.

**Vínculo.** O profissional autoriza via OAuth 2.0 (escopo de leitura e escrita de eventos) na própria conta Google, num fluxo separado do login: o login com Google pede só identidade, e o escopo de calendário é pedido apenas aqui (D-01). Um gestor pode iniciar o vínculo enviando um link ao profissional, mas o consentimento é sempre do dono da conta Google. O refresh token fica criptografado no Vínculo Google, que serve aos Profissionais da mesma pessoa em mais de uma conta (D-04). O sistema cria, em cada conta, um calendário secundário com o nome da conta (ex.: "Consultório Dr. Otávio") para não misturar com o calendário pessoal. Os escopos pedidos são os mínimos para isso (criar o secundário e mexer só nele, listar os calendários e ler os eventos dos outros); o link do gestor vale 7 dias e uma vez, e o profissional ou o gestor pode desvincular (D-59).

**Fluxo de dados.**

| Origem | Destino | O que vai | Quando |
| --- | --- | --- | --- |
| Sistema | Google (calendário secundário) | Evento com paciente (só primeiro nome), nome exibido do tipo (D-14), status no título, duração, observação interna fora: "Carlos · Procedimento (Agendado)". Cancelado e reagendado apagam o evento (D-62) | Ao criar, mudar status, reagendar ou cancelar; em até 30 s |
| Sistema | Google (calendário secundário) | Bloqueio manual como "Bloqueado", sem o motivo (D-85) | Ao criar, mudar ou remover; em até 30 s |
| Google (qualquer calendário marcado como ocupado) | Sistema | Bloqueio com título genérico "Compromisso Google" e horário; conteúdo do evento não é copiado | Via push notification (watch) com fallback de polling a cada 4 min, para o pior caso caber nos 5 min da seção 7 (D-61) |
| Google (calendário secundário) | Sistema | Alteração de horário ou exclusão de um evento criado pelo sistema | Mesmo canal; gera reagendamento ou cancelamento pendente de revisão (D-63) |

**Regras.**

1. O profissional escolhe quais calendários Google contam como ocupado; por padrão, todos os que ele tem com permissão de escrita, exceto o calendário secundário da própria conta, que é saída do sistema e nunca volta como bloqueio. O calendário secundário de outra conta do mesmo profissional conta como ocupado (D-15). A escolha pode incluir calendários só de leitura, e um calendário novo entra sozinho enquanto o profissional não escolher (D-60).
2. Evento marcado como "livre" no Google não bloqueia, com uma exceção: evento de dia inteiro bloqueia por padrão, porque o Google cria esses eventos como livres (férias, congressos). O profissional pode desligar essa exceção no perfil (D-15).
3. Mudança feita no Google em um atendimento não é aplicada direto: vira pendência na agenda com dois botões, aceitar ou reverter, que a secretária, o gestor ou o próprio profissional resolve (D-10). Evita que um arrasto acidental no celular remarque um paciente sem aviso. Aceitar remarca no horário do Google ou cancela pelo consultório; reverter devolve a versão do sistema ao Google; uma mudança no sistema antes da decisão fecha a pendência (D-63).
4. Conflito entre um atendimento já marcado e um evento novo no Google gera alerta para a secretária, não cancelamento automático. O alerta fica em Pendências (D-63, D-64, D-84).
5. Dados de saúde não saem do sistema: título do evento no Google leva primeiro nome e o nome exibido do tipo, sem CPF, telefone, diagnóstico ou nome de procedimento (D-14).
6. Revogação do OAuth ou token expirado aparece como aviso no perfil do profissional e no painel do gestor; a agenda continua funcionando sem o Google. O aviso também aparece na agenda (D-64).
7. Primeira sincronização importa os próximos 90 dias do Google como bloqueios e exporta os atendimentos futuros do sistema. Um job diário mantém essa janela móvel de 90 dias à frente (D-15); como cada leitura pede a janela inteira, ela anda a cada leitura (D-61).

**Fora de escopo.** Outlook e Apple Calendar nativos (Apple pode assinar o calendário Google exportado). Sincronização de agendas de pacientes.

## 6. Cadências de lembrete por WhatsApp

Uma régua é uma sequência de mensagens ancoradas no horário do atendimento, filtrada por tipo e status, com resposta do paciente que muda o status sozinha. Cada conta tem réguas próprias; a organização pode distribuir réguas padrão.

**Canal.** [WhatsAPI](https://whatsapi.my/landing), com uma instância por profissional em cada conta, conectada por QR Code ao número que o consultório já usa para aquele profissional. O sistema envia pela API da instância e recebe respostas por webhook. Não é a API oficial da Meta: não há aprovação de template nem janela de 24 h, as mensagens são texto livre, e há risco de desconexão ou bloqueio do número (seção 10). A WhatsAPI é revenda da uazapi; o cliente segue a API dela, e cada instância tem um webhook próprio, autenticado pelo token da instância (D-51). As conversas continuam na SynkronosCRM; aqui ficam só o disparo da régua, a leitura da resposta e o log.

**Número compartilhado (D-05).** Na SynkronosCRM, o número de cada profissional está conectado pela Z-API; aqui, pela WhatsAPI. As duas são aparelhos conectados ao mesmo número, então as duas recebem tudo o que o paciente manda. O sistema lê as respostas só pelo próprio webhook da WhatsAPI e não depende da Synkronos para isso. As mensagens da régua saem do mesmo número e aparecem na conversa da Synkronos pela sincronização entre aparelhos. O Bloco 5 conferiu isso com um número de teste, junto com o envio, os recibos e a resposta pela WhatsAPI real (D-57). Cada número usa duas das quatro vagas de aparelho conectado que o WhatsApp permite.

**Estrutura da régua.**

| Campo | Regra |
| --- | --- |
| Nome | Ex.: Consulta padrão, Procedimento com preparo, Exame |
| Aplica a | Categorias e tipos de atendimento; profissionais (todos ou lista) |
| Passos | 1 a 6 passos (no MVP, até 4), cada um com: quando (ao agendar, D-7, D-2, D-1 às 18h, H-3, H+2 para pós-atendimento na fase 3), status elegíveis (só Agendado; Agendado e Confirmado), texto e ação esperada: pedir confirmação ou só lembrar (D-06) |
| Janela de envio | Faixa de horário e dias, no fuso da unidade, em que a conta aceita disparar (ex.: 8h às 20h, segunda a sábado). Passo anterior ao atendimento que cai fora da janela é antecipado para o último horário válido antes dele; se esse horário já passou, é adiado para o próximo horário válido, desde que fiquem pelo menos 2 h antes do atendimento (margem configurável pela conta); se não couber, o passo é pulado e o pulo fica no log. Passos "ao agendar" e de pós-atendimento só são adiados. Passo cujo horário já passou no momento do agendamento é pulado (D-07). O fim da janela é um horário válido; o "ao agendar" de um importado é a ativação da régua em lote (D-52) |
| Parada | Confirmação encerra os passos que pedem confirmação; lembretes com status elegível Confirmado continuam. Cancelamento encerra a régua inteira. Contato manual marcado pela secretária encerra os pedidos de confirmação (D-06). Toda mudança de status encerra os passos para os quais o novo status não é elegível (D-53) |
| Pós-atendimento | Passo opcional H+2 ou D+1 com agradecimento ou lembrete de retorno (fase 3) |

**Variáveis de texto.** {primeiro\_nome}, {profissional}, {tipo} (nome exibido do tipo, D-14), {data\_extenso}, {hora}, {endereco}, {preparo}, {valor} (opcional por tipo), {link\_reagendar} (fase 2).

**Respostas e ações.**

| Resposta do paciente | Ação do sistema |
| --- | --- |
| 1, sim ou confirmo | Status vira Confirmado; encerram os passos que pedem confirmação, e os lembretes seguem (D-06); título do evento no Google Agenda atualiza |
| 2 ou remarcar | Fase 2: conversa guiada com 3 horários sugeridos. No MVP: marcador Pediu remarcação e aviso à secretária |
| 3, não ou cancelar | Status vira Cancelado pelo paciente; horário libera |
| Texto livre | Já aparece na SynkronosCRM, conectada ao mesmo número, e a secretária responde por lá; agendamento Agendado recebe o marcador Respondeu sem confirmar e a régua pausa até a secretária retomar ou confirmar (D-05, D-55) |
| Sem resposta até o último passo | Marcador Sem confirmação; aparece em Pendências para ligação manual (D-84) |

**Leitura da resposta (D-08).** Só vale resposta exata depois de normalizar (minúsculas, sem acento, sem espaços e pontuação nas pontas): "1", "sim" ou "confirmo"; "2" ou "remarcar"; "3", "nao" ou "cancelar". Qualquer outra coisa é texto livre: "não consigo às 10, pode às 11?" não cancela nada. A resposta vale para o agendamento da última mensagem de régua enviada por aquela instância àquele paciente, desde que o atendimento ainda esteja no futuro. "PARAR" revoga o consentimento (D-55).

**Regras.**

1. Paciente sem consentimento de contato não entra na régua; o consentimento é coletado no cadastro e pode ser revogado respondendo PARAR ou pela secretária, na tela do paciente. Aceite e revogação ficam num log só de inserção, com data e canal (D-47).
2. Reagendamento reinicia a régua a partir do novo horário, no agendamento novo (D-11); cancelamento encerra.
3. Disparo manual pela secretária a qualquer momento, com o mesmo texto, registrado no log.
4. Log por agendamento: cada passo com horário de envio, status de entrega (enviado, entregue, lido, falhou) e resposta.
5. Limite de 1 mensagem automática por paciente a cada 4 h, exceto resposta a interação dele; intervalo mínimo de 8 s entre disparos da mesma instância, para reduzir risco de bloqueio. Passo barrado pelo limite de 4 h é adiado até o fim do intervalo, respeitando a janela e a margem; se não couber, é pulado e registrado no log (D-07). O limite vale no planejamento e é conferido de novo no envio; disparo manual fica fora dele (D-52).
6. Prévia da régua: ao salvar, o sistema mostra o calendário de disparos para um atendimento fictício na próxima terça às 10h.
7. Réguas têm versão; mudar não altera disparos já agendados nas próximas 24 h. Os seguintes são replanejados com a versão nova, e o mesmo vale para mudanças de tipos, profissionais e janela (D-53).
8. Instância desconectada: os disparos ficam na fila. Na reconexão, são enviados só os passos vencidos há menos de 2 h cujo atendimento ainda está no futuro; os demais ficam no log como falhou, com o motivo "instância desconectada". Gestor e profissional recebem alerta por e-mail ao desconectar (D-09, D-54).

**Integração com a SynkronosCRM.** Não há caixa de entrada neste sistema. A SynkronosCRM já atende os números dos profissionais (conectados pela Z-API), então a integração é de eventos nos dois sentidos, pela [API do FlwChat](https://flwchat.readme.io/reference/autentica%C3%A7%C3%A3o) com token por conta.

| Sentido | Evento | Efeito |
| --- | --- | --- |
| Sistema para Synkronos | Agendamento criado, confirmado, reagendado, cancelado, atendido, faltou | A conversa do paciente no CRM mostra status, tipo, profissional, unidade e horário numa nota interna; etiqueta de status no contato, porque o FlwChat não tem etiqueta de conversa (D-68) |
| Sistema para Synkronos | Paciente criado ou celular alterado | Contato criado ou atualizado no CRM (D-68) |
| Synkronos para sistema | Secretária aplica no contato a etiqueta "Confirmar na agenda" ou "Contato manual na agenda" | Confirmar: status vira Confirmado e a régua para. Contato manual: os pedidos de confirmação param e o status não muda. A etiqueta sai depois (D-66) |

Consultórios podem dividir uma conta da Synkronos ou ter a sua (D-73): o token é da conta, a nota só vai para a conversa com o número do profissional, e a etiqueta de status, por ser do contato, aparece para as equipes de todos os consultórios da conta. A API do FlwChat não tem evento de "secretária confirmou"; a etiqueta de comando é a forma escolhida para isso (D-66), conferida numa conta real: a etiqueta aplicada na tela confirmou o agendamento e parou a régua em 4 s (D-70). O webhook não tem assinatura: a URL leva um segredo por conta, e o sistema relê o contato na API antes de agir, de modo que um evento forjado ou repetido não muda nada (D-67). Falha no CRM nunca impede a agenda: a exportação roda depois do commit, com novas tentativas (D-68).

Mensagem do paciente fora da régua não vem da Synkronos: o sistema já a recebe pelo webhook da WhatsAPI e aplica o marcador Respondeu sem confirmar (D-05). Evento da Synkronos que não identifica o agendamento segue a regra da leitura da resposta: vale o agendamento da última mensagem de régua enviada àquele paciente, entre os consultórios da conta (D-08, D-73); sem ela, ou com o atendimento já passado, nada muda e uma nota na conversa avisa a secretária (D-66). O mapeamento de endpoints e campos está em `docs/flwchat.md`.

## 7. Requisitos não funcionais

O sistema lida com dado pessoal de saúde (a existência de um atendimento já é dado sensível pela LGPD), então segurança e isolamento por conta são requisito de lançamento, não de roadmap.

| Área | Requisito |
| --- | --- |
| LGPD | Base legal documentada: execução de contrato para a agenda, com o exercício regular de direitos em contrato (art. 11, II, d) como hipótese correspondente para o dado sensível, e consentimento para WhatsApp (D-19). Consentimento registrado com data e canal (D-47); exportação e exclusão de dados do paciente por pedido do titular em até 15 dias; a exclusão pseudonimiza: o registro na trilha de auditoria fica e os dados pessoais saem (D-28, D-49); na SynkronosCRM, a exclusão apaga as notas e etiquetas que o sistema escreveu, e o gestor exclui lá o contato e as conversas, porque a API não os apaga (D-68); DPO nomeado; contratos de operador com WhatsAPI e SynkronosCRM. Os serviços de push (Google, Apple, Mozilla) entregam os avisos da PWA criptografados e sem ler o conteúdo, e o aviso nunca diz o nome do paciente (D-78) |
| Isolamento | Dados segregados por organização e conta em toda consulta; nenhum endpoint retorna dados de outra conta mesmo com ID adivinhado (testado em suíte automatizada). O filtro por conta fica na camada de dados da aplicação, numa extensão do Prisma que injeta o id da conta (`practiceId`, D-29) em toda query, e não no RLS do banco (D-02); no banco, chaves estrangeiras compostas e triggers impedem referência a outra conta e mudança de conta (D-30). Sem RLS, a Data API do Supabase fica desligada e sem permissões nas tabelas (D-97) |
| Segurança | TLS 1.2+, também até o banco (D-97); cabeçalhos de segurança e CSP com nonce (D-102); limite de tentativas de login guardado no banco, que vale entre instâncias (D-96); senhas com hash forte; tokens OAuth do Google criptografados em repouso, e os do login com Google nem são guardados (D-35); 2FA opcional e exigível por conta (D-16, D-36); sessão expira em 12 h de inatividade na web e em 30 dias na PWA, em dispositivo lembrado, a pedido e só para quem atende (D-17, D-37, D-77); o service worker não guarda tela nem resposta (D-76); trilha de auditoria imutável |
| Datas e fuso | Datas em UTC no banco; exibição e régua no fuso da unidade, padrão America/Fortaleza (D-03) |
| Disponibilidade | 99,5% mensal no horário comercial (7h às 22h, Brasília), medido por um monitor externo em `/api/health` (D-101); fila de disparos tolera instância WhatsAPI desconectada e, na reconexão, envia o que venceu há menos de 2 h (D-09) |
| Desempenho | Agenda do dia carrega em menos de 1,5 s com 8 profissionais; busca de paciente responde em menos de 500 ms com 50 mil cadastros por conta (medido: D-50) |
| Sincronização | Alteração no sistema aparece no Google em até 30 s; evento do Google aparece como bloqueio em até 5 min |
| Mobile | Web responsiva para secretária e gestor; PWA para o profissional com agenda do dia e notificação de confirmação por Web Push, ativada por aparelho (D-76, D-78). Sem conexão, a tela diz isso em vez de mostrar agenda velha (D-76); sem app nativo no MVP |
| Backup | Diário, restauração testada por trimestre, em projeto à parte. Retenção de 7 dias no piloto, a do Supabase Pro, e de 30 dias ao sair dele, no Gate 1; os caminhos estão na D-103 |
| Observabilidade | Painel interno com taxa de entrega de WhatsApp, falhas de sincronização e erros por conta: a tela Saúde da operação, para gestor e admin, e `npm run operador:saude`, entre organizações. O erro guarda onde e de que tipo, nunca a mensagem (D-101) |
| Repositório | Público. Nenhum dado real em arquivo, teste ou commit, e o sistema não depende de o código ser secreto (D-104) |

## 8. Métricas de sucesso

A métrica que define o produto é a taxa de falta: iClinic promete até 30% de redução com confirmação automática; a meta aqui é falta abaixo de 10% nas contas com régua ativa após 90 dias (D-25).

| Indicador | Definição | Meta em 90 dias |
| --- | --- | --- |
| Taxa de falta | Faltou ÷ (Atendido + Faltou) por conta e por tipo; agendamentos Sem baixa ficam de fora e são mostrados à parte (D-13) | Abaixo de 10% |
| Taxa de confirmação automática | Confirmados via WhatsApp ÷ agendamentos elegíveis à régua: com pedido de confirmação planejado, fora Reagendado e cancelado antes de o pedido sair (D-74) | Acima de 70% |
| Tempo da secretária em confirmação | Minutos por dia em contato manual de confirmação (medido enquanto a tela Pendências mostra os Sem confirmação, a partir do Bloco 8; o início são os 7 primeiros dias medidos, D-75, D-84) | Queda de 60% frente ao início |
| Cobertura de Google Agenda | Profissionais com vínculo ativo ÷ profissionais cadastrados | Acima de 80% |
| Falhas de sincronização | Eventos com erro ÷ eventos que a exportação alcançou, no Google (D-74) | Abaixo de 0,5% |
| Entrega de WhatsApp | Entregues ÷ enviados | Acima de 95% |
| Ocupação da agenda | Horários ocupados ÷ horários disponíveis por profissional, em minutos, sem exceções e bloqueios (D-74) | Acompanhar; meta por conta |
| Valor previsto vs realizado | Valor realizado ÷ valor previsto no período, com as definições do painel da seção 4 (D-13) | Acima de 85% |
| Adoção por conta | Contas com 5+ dias úteis de uso na semana ÷ contas ativas. Uso é ação de usuário na trilha de auditoria, de segunda a sábado; a taxa entre contas é só do admin da organização (D-75) | Acima de 90% |

## 9. Escopo do MVP e roadmap

O MVP é o que faz uma secretária trocar a planilha pelo sistema numa semana: agenda multiusuário, tipos com valor, Google Agenda de mão dupla e régua de WhatsApp com confirmação automática. O que não reduz falta nem economiza tempo da secretária fica para depois.

**Roadmap.** Três fases, cada uma liberada por um gate de uso real (transcrito do diagrama do PRD original, D-20).

| Fase | O que entra | Gate para a fase seguinte |
| --- | --- | --- |
| Fase 1 · MVP | Contas, papéis e agenda; tipos com valor, cor e duração; régua de WhatsApp com confirmação; Google Agenda de mão dupla; indicadores da seção 8 (D-26) | Gate 1: 3 contas piloto com falta abaixo de 15% |
| Fase 2 · Operação | Lista de espera e encaixe; fallback por SMS; reagendar pelo WhatsApp | Gate 2: 20 contas ativas com entrega de WhatsApp acima de 95% |
| Fase 3 · Crescimento | Agendamento online; app nativo do profissional; pós-atendimento e avaliação; API pública e integrações, incluindo migração direta de iClinic e Feegow | — |

No diagrama original, o painel de indicadores estava na fase 2; ele passou para o MVP porque o Gate 1 depende da taxa de falta e o Bloco 8 já o constrói (D-26).

Cada fase só começa quando o gate anterior é batido em contas reais; as fases 2 e 3 são ordem de prioridade, não compromisso de data.

**Dentro do MVP.**

- Organização, contas com unidades, papéis e convite de usuários (seção 3).
- Tipos de atendimento com categoria, duração, valor informativo, cor, preparo e régua; agenda dia, semana, mês e multiprofissional; lista do dia com Sem baixa; painel de valor previsto; convênio como campo simples (seção 4).
- Google Agenda de mão dupla por profissional com pendência de revisão (seção 5).
- Régua de WhatsApp via WhatsAPI, uma instância por profissional, até 4 passos, respostas 1/2/3, log de entrega e lista Sem confirmação; eventos trocados com a SynkronosCRM (seção 6).
- Cadastro de paciente com consentimento; importação de pacientes e agenda por planilha (modelo CSV fornecido); trilha de auditoria; exportação e exclusão do titular (D-28).
- PWA do profissional com agenda do dia, próximo atendimento e aviso de confirmação (D-76 a D-78).
- Indicadores da seção 8 (D-26).

**Fora do MVP.** Reagendamento guiado pelo WhatsApp (fase 2), lista de espera (fase 2), SMS de fallback (fase 2), agendamento online pelo paciente (fase 3), app nativo (fase 3), pós-atendimento (fase 3), API pública (fase 3), migração direta de iClinic ou Feegow (fase 3), recorrência (sem fase) e recebimento por Pix ou link (sem fase).

## 10. Riscos, premissas e perguntas em aberto

O maior risco não é técnico: é o médico que já usa iClinic ou Feegow para prontuário e não quer uma segunda tela. O produto precisa coexistir, não substituir, pelo menos no início.

**Riscos.**

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Consultório já usa iClinic ou Feegow com prontuário | Resistência a duplicar agenda | Posicionar como camada de agenda e WhatsApp; importação por planilha no MVP e integração direta na fase 3 |
| Instância WhatsAPI desconecta ou o número é bloqueado pela Meta (API não oficial) | Régua para em silêncio; número do profissional fora do ar | Monitor de conexão por instância com alerta ao gestor e ao profissional; limite de disparos por hora e intervalo entre mensagens; número de uso profissional, nunca o pessoal do médico |
| Mesmo número conectado em duas integrações não oficiais (Z-API na Synkronos, WhatsAPI aqui) | Número sem vaga para outro aparelho conectado; mais exposição a bloqueio | Conferir as vagas antes de conectar (o WhatsApp permite quatro aparelhos conectados); limites de disparo da seção 6 (D-05) |
| Mudança de comportamento do WhatsApp quebra a WhatsAPI | Envio falha em todas as contas de uma vez | Camada de envio isolada por trás de uma interface própria, para trocar de provedor sem mexer na régua; fila guarda os disparos e, na reconexão, envia o que venceu há menos de 2 h (D-09) |
| Google revogar ou limitar o escopo de calendário | Sincronização cai | Agenda funciona sem o Google; verificação OAuth da Google iniciada na semana 1 e concluída antes de passar de 100 usuários; até lá, app publicado em produção e não em Testing (D-24) |
| Dado de saúde na mensagem de WhatsApp | Exposição e sanção LGPD | Mensagem sem diagnóstico nem procedimento sensível por padrão; nome exibido do tipo no lugar do nome do procedimento (D-14); campo preparo revisado pelo gestor |
| Evento arrastado no Google reagenda paciente | Paciente sem aviso | Mudança vinda do Google vira pendência, nunca aplicação direta |
| Status divergente entre sistema e SynkronosCRM | Secretária confirma no CRM e a régua segue disparando | Webhook da Synkronos para o sistema no MVP; reconciliação diária dos agendamentos do dia seguinte, às 17h de Fortaleza, antes dos pedidos D-1 (D-69) |

**Premissas.**

- Cobrança por conta (consultório), não por profissional, para não repetir o modelo do iClinic que escala rápido para clínicas com equipe.
- WhatsApp via WhatsAPI, uma instância por profissional em cada conta; as conversas vivem na SynkronosCRM e este sistema não tem caixa de entrada.
- Primeiro público: consultórios particulares atendidos por operações de secretárias remotas; clínicas com recepção própria vêm em seguida.

**Perguntas em aberto.** Nenhuma no momento. A D-05, a D-19 e a D-28, que estavam abertas, foram respondidas em 27/10/2026 e estão registradas em `docs/decisoes.md`.

**Decisões tomadas em 20/10/2026.**

| Pergunta | Decisão |
| --- | --- |
| Canal de WhatsApp | WhatsAPI, uma instância por profissional; conversas na SynkronosCRM via API do FlwChat |
| Valor por tipo | Só informativo no MVP; sem Pix nem link |
| Convênio | Campo simples no agendamento e no paciente, sem TISS |
| App do profissional | PWA; app nativo fica para a fase 3 |
| Unidades por conta | Sim, já no MVP |
| Migração de agenda | Por planilha, com modelo CSV; iClinic e Feegow sem importação direta no MVP |

As decisões da revisão de 27/10/2026 (D-01 a D-28) estão aplicadas no texto e registradas em `docs/decisoes.md`.

## 11. Telas principais

Cinco telas principais têm mockup; os [mockups](https://claude.ai/artifact/5NFzJMmuTRwhMB5VPeEfmT) estão no canvas de design e são a referência visual para a construção. A organização atual das telas segue a [proposta validada](https://claude.ai/artifact/PzwcNxqHUmd23HtfYH7eJn): menu lateral, agenda enxuta, detalhe em painel e Pendências (D-81 a D-84).

| Tela | Quem usa | O que faz | Seção do PRD |
| --- | --- | --- | --- |
| Agenda semanal | Secretária, gestor | Grade dia/semana/mês por profissional e lista do dia, cor por tipo (família de cores pela categoria, D-25), status de confirmação em ícone, bloqueios, faixa com o valor previsto, horário livre que abre agendamento ou bloqueio, detalhe em painel (D-82, D-83, D-85). Seletor de conta e busca no topo (D-81) | 4, 5 |
| Novo agendamento | Secretária | Busca de paciente com cadastro inline, tipo que preenche duração, valor e régua, unidade, data e hora à frente; o resto em Mais detalhes; horas livres do dia na lateral, prévia da régua e do evento Google (D-82) | 4, 6 |
| Tipos de atendimento | Gestor | Tabela e formulário com categoria, nome exibido, duração, valor, cor, preparo e régua | 4 |
| Régua de WhatsApp | Gestor | Passos com gatilho, status elegível, ação esperada e texto com variáveis; janela de envio; status das instâncias WhatsAPI; prévia dos disparos | 6 |
| PWA do profissional | Médico, dentista | Agenda do dia, próximo atendimento em destaque, pendência do Google, marcar chegada, aviso de confirmação, bloquear horário (D-76, D-78, D-85) | 5, 7 |

**Telas sem mockup ainda.** Todas entram no MVP (D-23).

| Tela | O que faz | Seção do PRD |
| --- | --- | --- |
| Pacientes | Lista, busca ao digitar, adicionar paciente, Agendar na linha, consentimento, celular, todos os agendamentos do paciente, importação CSV com ativação da régua em lote, exportação e exclusão do titular (D-47 a D-50, D-68, D-89) | 4, 7 |
| Usuários e papéis | Convite, papéis por conta, desligamento | 3 |
| Unidades e horários | Unidades da conta com endereço e fuso; horário de atendimento por profissional, unidade e dia, com exceções de dias inteiros (D-86) | 3, 4 |
| Perfil do profissional | Cadastro, unidades e desativação (D-91); vínculo Google (link para o profissional autorizar), calendários que contam como ocupado, regra de dia inteiro; URL, token, número e status da instância WhatsAPI, com o QR Code no painel dela (D-94). Telas Profissionais (gestor) e Meu perfil (profissional) no Bloco 6 (D-64) | 3, 5, 6 |
| Configurações | Reúne, por grupo, Tipos, Régua, Profissionais, Usuários, Unidades e horários, Segurança e integrações e Trilha de auditoria (D-81) | 11 |
| Segurança e integrações | Exigir 2FA, com o aviso de quem ainda não ativou, inclusive o próprio gestor (D-36, D-71); token do FlwChat, situação da conexão com a Synkronos, aviso de conta compartilhada e últimas ações da secretária (D-68, D-73). A janela de envio e a margem ficam na tela da régua (D-56) | 3, 6 |
| Pendências | Lista única, por data, com Sem confirmação, respostas do paciente, mudanças e conflitos do Google e Sem baixa, com a ação na linha e contador no menu (D-84) | 4, 5, 6 |
| Trilha de auditoria | Quando, quem, o que aconteceu, onde e quais campos mudaram, com filtros, para gestor e admin (D-87) | 3 |
| Esqueci minha senha | Pedido do link e criação da senha nova (D-88) | 3 |
| Log de disparos por agendamento | Passos, entrega e resposta, na aba Mensagens do agendamento (D-83) | 6 |
| Indicadores | Indicadores da seção 8, por conta, para gestor e admin, com o consolidado da organização para o admin (D-26, D-74, D-75) | 8 |
| Saúde da operação | Entrega de WhatsApp, motivos do que não saiu, instâncias, filas e falhas do Google e do CRM e erros por rota, para gestor e admin, com a tabela por conta para o admin (D-101) | 7 |
| Página inicial e política de privacidade | Públicas, sem login, com texto provisório: a verificação do Google pede as duas (D-99) | 7 |

## 12. Construção no Claude Code

O caminho mais rápido é um monorepo simples, com stack que o Claude Code domina sem pesquisa, construído em oito blocos pequenos, mais um para deixar o código publicável (D-93 a D-103), cada um fechado com teste antes do próximo. Este PRD vira o arquivo de contexto do repositório.

**Stack recomendada.** Escolhida para reduzir decisões e código escrito à mão, não por preferência técnica.

| Camada | Escolha | Por quê |
| --- | --- | --- |
| App e API | Next.js 16 (App Router) com TypeScript, em um único projeto (D-25) | Uma base de código para web, PWA e rotas de API; o Claude Code gera páginas e endpoints no mesmo padrão |
| Banco | PostgreSQL (Supabase ou Neon) com Prisma | Schema declarativo que o Claude Code lê e evolui com migrações. O isolamento por conta fica numa extensão do Prisma que injeta o id da conta (`practiceId`, D-29) em toda query: com o Prisma conectando como dono das tabelas, o RLS não vale sem configuração extra (D-02) |
| Auth | Better Auth: e-mail e senha, e Google só com escopo de identidade (D-02) | O Auth.js passou a ser mantido pelo time do Better Auth em 2025, que recomenda o Better Auth para projetos novos. O vínculo do Google Agenda é um fluxo OAuth separado (D-01) |
| UI | Tailwind + shadcn/ui | Componentes prontos de formulário, tabela e dialog; os mockups já seguem esse visual |
| Jobs e filas | Inngest (ou BullMQ com Redis) | Disparos da régua são funções agendadas com retry; Inngest dispensa infraestrutura própria. Adotado o Inngest 4.26.1, com tick por minuto e drenagem por instância (D-54). A conta de execuções e o plano estão na D-100 |
| Google Agenda | googleapis (Node) com watch + fallback de polling; OAuth próprio para o vínculo, com refresh token criptografado (D-01). Adotado o googleapis 186.0.0, atrás da interface GoogleCalendarProvider, com um Google falso em tabela para testes e desenvolvimento (D-58) | Biblioteca oficial, bem documentada |
| WhatsApp | Cliente HTTP próprio sobre a WhatsAPI, atrás de uma interface MessagingProvider | Troca de provedor sem mexer na régua (seção 10) |
| SynkronosCRM | Cliente HTTP sobre a API do FlwChat, atrás de uma interface CrmSync, com um CRM falso em tabela para testes e desenvolvimento (D-66) | Mesmo motivo |
| Testes | Vitest (unidade) e Playwright (fluxo crítico) | O Claude Code roda os dois sem configuração extra |
| Deploy | Vercel (app) + Supabase (banco), em São Paulo (`gru1`, D-97); roteiro em `docs/publicacao.md` | Deploy por push; preview por branch para o gestor validar, que se comporta como fora de produção (D-95) |

**Preparação do repositório (antes do primeiro prompt).**

1. Criar o repo com o scaffold do Next.js e colocar este PRD exportado em Markdown em `docs/PRD.md`.
2. Escrever `CLAUDE.md` na raiz com: stack acima, convenções (português nos textos de interface, inglês no código, datas em UTC no banco e exibidas no fuso da unidade, padrão America/Fortaleza, D-03), regra de isolamento por conta em toda query (extensão do Prisma, D-02), comando de teste e o pedido de ler `docs/PRD.md` e `docs/decisoes.md` antes de qualquer tarefa.
3. Salvar os cinco mockups como PNG em `docs/mockups/` e referenciá-los no CLAUDE.md; o Claude Code lê imagens e segue o layout.
4. Guardar em `.env.example` as chaves esperadas: Google OAuth, WhatsAPI (token e URL da instância), FlwChat (token), banco.
5. Criar `docs/decisoes.md` com a tabela da seção 10 e ir registrando ali cada decisão nova tomada durante a construção.
6. Criar o app OAuth no Google Cloud, ativar a Google Calendar API no projeto e pedir a verificação na semana 1. Até ela sair, publicar o app em produção (com a tela de app não verificado e o limite de 100 usuários), nunca em Testing: nesse modo o refresh token expira em 7 dias e só passam as contas cadastradas como usuárias de teste (D-24, D-65).
7. Ter uma URL HTTPS pública para os webhooks (push do Google e respostas da WhatsAPI) já no desenvolvimento: túnel (cloudflared ou ngrok) ou preview da Vercel (D-24).

**Ordem de construção.** Um bloco por sessão; cada bloco termina com teste passando e commit.

| Bloco | Entrega | Critério de pronto |
| --- | --- | --- |
| 1. Schema e contas | Prisma com Organização, Conta, Unidade (com fuso), Profissional, Usuário, alocação de Usuário em Conta com papel, Convite, Paciente, Consentimento, TipoAtendimento, ValorPorProfissional, HorarioAtendimento e Excecao (por profissional, unidade e dia), Bloqueio, Agendamento (com valor e duração copiados e ligação ao original no reagendamento), HistoricoStatus, Marcador, Regua, Passo, Disparo, InstanciaWhatsApp, VinculoGoogle, CalendarioSecundario, PendenciaGoogle, EventoAuditoria (guarda IDs e nomes dos campos alterados, sem cópia de dado pessoal, D-28); extensão do Prisma que filtra por conta; seed com a conta do mockup (D-04) | Migração roda; teste de isolamento por conta passa |
| 2. Auth e papéis | Login e-mail/senha e Google (só identidade); 2FA exigível por conta; convite; seletor de conta; middleware de permissão por papel: proxy otimista e checagem na camada de dados (D-35 a D-40) | Secretária não acessa tela de régua; gestor acessa |
| 3. Tipos e agenda | CRUD de tipos; busca e cadastro rápido de paciente (D-22); agenda dia/semana/mês e multiprofissional; novo agendamento; status, transições e histórico; lista do dia com Sem baixa; painel de valor | Fluxo marcar, confirmar, remarcar e cancelar passa no Playwright |
| 4. Pacientes e importação | Consentimento; importação CSV de pacientes e agenda com modelo (D-18); exportação e exclusão do titular (D-28); tela Pacientes (D-47 a D-50) | Planilha de 500 linhas importa com relatório de erros |
| 5. Régua e WhatsAPI | Editor de régua; motor de agendamento de disparos (Inngest) com janela, margem e limite de 4 h; cliente WhatsAPI; webhook de resposta; log; lista Sem confirmação | Resposta 1 muda status em até 10 s no ambiente de teste; mensagem enviada pela WhatsAPI aparece na conversa da Synkronos (D-05) |
| 6. Google Agenda | OAuth do vínculo, separado do login; calendário secundário; push de eventos; watch e polling com janela móvel de 90 dias; pendências de revisão | Bloqueio criado no Google aparece em até 5 min; evento arrastado vira pendência; o secundário da própria conta não volta como bloqueio; evento de dia inteiro bloqueia |
| 7. SynkronosCRM | Cliente FlwChat; eventos de saída; webhook de entrada só para contato manual e confirmação feitos pela secretária com etiqueta de comando (D-66), porque as mensagens do paciente chegam pela WhatsAPI (D-05); reconciliação diária; tela Configurações | Confirmação feita no CRM para a régua |
| 8. PWA e indicadores | Manifest, service worker sem dados de paciente, tela do profissional, sessão de 30 dias e Web Push; painel de indicadores da seção 8 (D-26, D-74 a D-78) | PWA instala no celular (D-79); indicadores batem com o seed |
| 9. Produção | Primeira conta, instância de WhatsApp na tela, preview separado de produção, limite de login no banco, URLs e deploy, seed com trava, páginas públicas, conta do Inngest, observabilidade e cabeçalhos (D-93 a D-103) | Código publicável; roteiro e o que falta testar em `docs/publicacao.md` |

**Como pedir cada bloco ao Claude Code.** Um prompt por bloco, sempre com a mesma forma: o objetivo em uma frase, as seções do PRD que valem para o bloco, o mockup correspondente, o critério de pronto e a instrução de escrever o teste antes da implementação. Exemplo para o bloco 5:

```markdown
Leia docs/PRD.md, seções 6 e 10, docs/decisoes.md e docs/mockups/regua-whatsapp.png.
As respostas do paciente entram só pelo webhook da WhatsAPI (D-05).
Implemente o editor de régua e o motor de disparos conforme a seção 6.
O cliente WhatsAPI fica atrás da interface MessagingProvider em src/lib/messaging.
Comece pelos testes: agendamento de passos a partir de um horário, janela de envio com antecipação e margem, limite de 4 h, parada ao confirmar só nos pedidos de confirmação.
Critério de pronto: webhook com resposta "1" muda o status para Confirmado e encerra os pedidos de confirmação.
Não implemente reagendamento guiado nem caixa de entrada.
```

**Práticas que aceleram.**

- Plan mode no início de cada bloco: o Claude Code propõe os arquivos e a ordem antes de escrever; corrigir o plano custa menos que corrigir código.
- Um comando `npm run check` que roda lint, tipos e testes; pedir que ele seja executado antes de cada commit.
- Quando o computador não aguenta o `npm run check`, ele roda numa sessão do Claude Code na nuvem, preparada por `scripts/cloud-setup.sh` (D-105).
- Sandbox dos provedores: um `MessagingProvider` falso e um `CrmSync` falso que gravam em tabela, para a régua ser testada sem número real nem token do FlwChat.
- Seed realista: a conta do Dr. Otávio, a dos mockups com outro nome (D-104), com 7 tipos, 3 réguas e uma semana de agenda, para que toda tela nasça com dados.
- Subagentes para o que é independente: enquanto um bloco está em andamento, pedir em paralelo a documentação da API do FlwChat em `docs/flwchat.md` e o modelo CSV de importação.
- Registrar no `docs/decisoes.md` toda escolha feita no meio do caminho, para a próxima sessão não reabrir o assunto.

**Estimativa.** Com um bloco por dia útil e revisão do gestor a cada bloco, o MVP fica pronto para o piloto em 3 a 4 semanas. O bloco 6 (Google Agenda) é o de maior risco de atraso pela verificação OAuth da Google, que deve ser iniciada na semana 1 (item 6 da preparação).
