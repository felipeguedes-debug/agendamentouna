# API do FlwChat (SynkronosCRM)

Mapeamento lido em 01/11/2026 da [documentação do FlwChat](https://flwchat.readme.io/reference/autentica%C3%A7%C3%A3o), inclusive o OpenAPI de cada endpoint (acrescentar `.md` à URL da página traz o OpenAPI em JSON), e conferido na API real em 01 e 02/11/2026 (D-70). O que a documentação não diz e o teste mediu está em **Medido no teste real**, no fim.

## Autenticação

- **Token permanente por conta** do FlwChat, criado em Ajustes > Integrações > Integração via API. Formato `pn_...`.
- Header em toda requisição: `Authorization: Bearer pn_...`.
- O token dá acesso à conta inteira. Não há escopos. Excluído na plataforma, as integrações param.
- A API não tem endpoint para apagar contato (D-68).

## Servidores

O OpenAPI separa a API em três módulos, cada um com um prefixo:

| Módulo | Base |
| --- | --- |
| Core (contatos, etiquetas, webhooks) | `https://api.wts.chat/core` |
| Chat (conversas, notas, canais) | `https://api.wts.chat/chat` |
| CRM (painéis e cards) | `https://api.wts.chat/crm` |

A página de firewall lista `api.flw.chat` e `api.wts.chat` como hosts da API, e os dois respondem. O guia do token dá o exemplo `https://api.flw.chat/v1/channel`, sem o prefixo do módulo: isso responde 404. Vale o prefixo do OpenAPI.

## Limites

- 1.000 requisições a cada 5 minutos e 200 a cada 5 segundos, **por conta**. Acima disso, `429`.
- A documentação pede espera antes de repetir (backoff).
- Listagens: `pageNumber` e `pageSize` (máximo 100), resposta com `items`, `totalPages`, `totalItems` e `hasMorePages`.
- Erro: o OpenAPI só declara `200` e `500`, com `InternalException` (`key`, `text`, `httpStatusCode`). Na prática, token inválido responde 401, e **contato inexistente responde 500**, com `key` `FORM_ERROR` (por telefone) ou `ENTITY_NOT_FOUND` (por id) e o texto "Contato não encontrado".

## Endpoints que o Bloco 7 usa

### Contatos (Core)

| Método e caminho | Uso |
| --- | --- |
| `POST /v1/contact` | Cria. `options.upsert` atualiza se já existir, `options.upsertFields` limita os campos, `options.upsertTagOperation` define as etiquetas (padrão `REPLACEALL`, que apagaria as outras) e `options.getIfExists` devolve o existente sem alterar |
| `GET /v1/contact/phonenumber/{phone}` | Lê pelo telefone. `IncludeDetails=Tags` traz as etiquetas |
| `PUT /v1/contact/phonenumber/{phone}` | Atualiza os campos listados em `fields` (`Name`, `PhoneNumber`, `Metadata`, `Tags`...) |
| `GET /v1/contact/{id}` | Lê pelo id |
| `POST /v1/contact/phonenumber/{phone}/tags` | Etiquetas pelo telefone: `tagNames` ou `tagIds`, `operation` = `InsertIfNotExists`, `DeleteIfExists` ou `ReplaceAll` |
| `POST /v1/contact/{id}/tags` | O mesmo, pelo id do contato |

Campos do contato que importam aqui: `id`, `name`, `phoneNumber`, `tagIds`, `tagNames`, `annotation` (notas da equipe, um texto só), `customFields`, `metadata` (chave-valor; valor nulo remove a chave), `status` (`ACTIVE`, `ARCHIVED`, `BLOCKED`).

**Formato do telefone:** a resposta traz `"+55|11999990000"`. Na URL valem os dígitos com DDI, sem DDI ou com `+`. A busca é exata quanto ao nono dígito: o número sem ele não acha o contato que tem, então o cliente tenta as duas formas.

### Etiquetas (Core)

| Método e caminho | Uso |
| --- | --- |
| `GET /v1/tag` | Lista (`id`, `name`, `color`) |
| `POST /v1/tag` | Cria (`name`, `color` opcional, padrão `GRAY_600`). **Aceita nome repetido** |
| `GET /v1/tag/color` | Cores aceitas |
| `DELETE /v1/tag/{id}` | Apaga. Exige corpo JSON, por exemplo `{ "removeFromContacts": false }`, que recusa se a etiqueta estiver em algum contato |

**Etiqueta é do contato, não da conversa.** A conversa não tem campo de etiqueta próprio; `TagsId` e `TagsName` na listagem de conversas só filtram. O PRD fala em "etiqueta de status aplicada na conversa": na prática, ela aparece na conversa por ser do contato, e um paciente com dois agendamentos tem uma etiqueta só por vez, ou duas.

### Conversas e notas (Chat)

| Método e caminho | Uso |
| --- | --- |
| `GET /v2/session?ContactId=...` | Conversas do contato. Filtros: `Status`, `ChannelsId`, `Type`, datas; ordem por `OrderBy` e `OrderDirection`. `ChannelsId` e `OrderBy=CreatedAt` conferidos |
| `GET /v2/session/{id}` | Uma conversa. Traz `metadata`, `classification`, `status`, `userId` |
| `PUT /v2/session/{id}/partial` | Altera `Status`, `Metadata`, `Classification` etc. (`fields`) |
| `POST /v1/session/{id}/note` | **Nota interna** na conversa (`text`). Não vai para o paciente. É o único jeito de a conversa mostrar status, tipo, profissional, unidade e horário |
| `DELETE /v1/session/note/{id}` | Apaga uma nota interna, mas a API continua listando-a, com status `DELETED` e o texto. A exclusão do titular usa (D-68) |
| `GET /v1/channel` | Canais (`id`, `number`, `type`, como `ZAPI_WhatsApp`) |

**Nota precisa de conversa.** Contato que nunca conversou não tem onde receber nota. A API não cria conversa sem enviar mensagem, e este sistema não envia mensagem pelo CRM.

### Painéis e cards (CRM)

`GET /v2/panel`, `GET /v1/panel/{id}`, `POST /v2/panel/card` (`stepId`, `title`, `contactIds`, `sessionId`, `dueDate`, `metadata`), `PUT /v3/panel/card/{id}` (`stepId` move o card). O sistema não usa: é a opção 2 abaixo, descartada na D-66.

## Webhooks

### Assinatura (Core)

| Método e caminho | Uso |
| --- | --- |
| `GET /v1/webhook/event` | Eventos disponíveis |
| `GET /v1/webhook/subscription` | Assinaturas da conta |
| `POST /v1/webhook/subscription` | Cria: `name`, `url`, `events`, `enabled` |
| `PUT /v1/webhook/subscription/{id}` | Atualiza (`fields`: `Name`, `Url`, `Events`, `Enabled`) |
| `DELETE /v1/webhook/subscription/{id}` | Remove |

A assinatura também pode ser feita à mão em Ajustes > Integrações > Webhooks.

### Eventos disponíveis

`SESSION_NEW`, `SESSION_UPDATE`, `SESSION_COMPLETE`, `MESSAGE_RECEIVED`, `MESSAGE_UPDATED`, `MESSAGE_SENT`, `CONTACT_NEW`, `CONTACT_UPDATE`, `CONTACT_TAG_UPDATE`, `PAYMENT_NEW`, `PAYMENT_UPDATE`, `PANEL_CARD_NEW`, `PANEL_CARD_UPDATE`, `PANEL_CARD_STEP_CHANGE`, `PANEL_CARD_NOTE_NEW`, `PANEL_CARD_NOTE_UPDATE`, `TEMPLATE_NEW`, `TEMPLATE_UPDATE`.

### Corpo

`POST` com `application/json`:

```json
{
  "eventType": "CONTACT_UPDATE",
  "date": "2023-08-23T16:42:35.4359934Z",
  "content": {
    "id": "ed2b52f8-cf13-449b-b3d5-ae27051f4663",
    "companyId": "626fb5de-0cc2-4209-b456-47b454ee6e14",
    "name": "John Raymond Legrasse",
    "phonenumber": "+55|00000000000",
    "tagsId": [],
    "tags": [],
    "status": "ACTIVE",
    "metadata": null
  }
}
```

A documentação só traz esse exemplo. O `content` de `CONTACT_TAG_UPDATE` é o mesmo: o contato inteiro, com `phonenumber`, `tagsId` e `tags` (lista de nomes em maiúsculas), além de nome e e-mail. O `date` vem em UTC, como `2026-11-02T10:42:36.3094295Z`.

## O que o PRD supõe e a API não oferece

1. **Não há evento "secretária confirmou" nem "contato manual".** A lista acima é fechada. Nada na API representa essa ação: ela precisa ser construída sobre um dos eventos genéricos. Esta é a decisão que precisa do usuário; as opções estão abaixo.
2. **O webhook não tem autenticação própria.** A assinatura só aceita `name`, `url`, `events` e `enabled`: nenhum segredo, assinatura ou header. O corpo não traz nada que prove a origem. O que existe é o IP de saída publicado (`18.215.79.89`) e o `companyId` do corpo, fáceis de forjar para quem souber o valor. Sobra um segredo na própria URL e reler o dado na API com o token da conta.
3. **O webhook não tem id de evento.** Nada no envelope identifica a entrega, e a política de novas tentativas não está documentada. Evento repetido precisa ser tratado pelo estado, não por um id.
4. **Etiqueta é do contato** (seção Etiquetas): não separa dois agendamentos do mesmo paciente.
5. **Nota precisa de conversa aberta ou antiga** (seção Conversas): paciente sem conversa fica só com a etiqueta.
6. **O evento não diz quem fez a ação**, a não ser em cards (`responsibleUser`) e conversas (`userId`, o atendente da conversa, que não é necessariamente quem agiu).

## Opções para a ação da secretária

| | Como a secretária faz | Evento | Identifica o agendamento | Custo e risco |
| --- | --- | --- | --- | --- |
| **1. Etiqueta de comando** | Aplica "Confirmar na agenda" ou "Contato manual na agenda" no contato, sem sair da conversa | `CONTACT_TAG_UPDATE` | Não: segue a D-08 (última mensagem de régua ao paciente) | Menor. Duas etiquetas criadas pela API. Conteúdo do evento a conferir no teste real |
| **2. Card em painel** | Move o card do agendamento para a etapa "Confirmado" ou "Contato manual" | `PANEL_CARD_STEP_CHANGE` | Sim: o id do agendamento vai em `metadata` do card | Maior. Um card por agendamento, um painel e etapas por conta, e a secretária sai da conversa. Depende de o plano incluir painéis |
| **3. Classificação ao concluir** | Conclui a conversa com a classificação "Confirmou" | `SESSION_COMPLETE` | Não: segue a D-08 | Obriga a concluir a conversa, e a classificação é usada também para outros fins |
| **4. Comando em texto** | Escreve `/confirmar` numa nota ou mensagem | `MESSAGE_SENT` | Não: segue a D-08 | Maior risco: um erro de digitação ou o comando indo ao paciente. Não está documentado se nota dispara evento |

Felipe Guedes escolheu a opção 1 em 01/11/2026 (D-66). O que fazer com os outros pontos da lista acima está na D-67 (webhook e evento repetido) e na D-68 (etiqueta, nota e contato).

## Medido no teste real

Em 01 e 02/11/2026, numa conta real, escrevendo só num contato de teste (D-70).

- **Etiqueta aplicada pela tela gera `CONTACT_TAG_UPDATE`; pela API, não.** As escritas do próprio sistema não voltam como evento. O evento cobre a conta inteira: numa conta movimentada, chegam eventos de outros contatos o tempo todo.
- **Nomes de etiqueta:** no contato (`tagNames`) e no evento (`tags`) vêm em maiúsculas (`AGENDA: CONFIRMADO`); na lista de etiquetas e em `contactDetails.tagsName`, como foram criados. `InsertIfNotExists` e `DeleteIfExists` acham o nome em qualquer caixa. Por isso o sistema nunca compara nomes como vêm (`sameTag`).
- **A lista `GET /v1/tag` tem cache de alguns minutos:** etiqueta criada não aparece na hora, nem apagada some na hora. Como a API aceita nome repetido, criar etiquetas de novo logo depois de criá-las duplicaria. Por isso elas só são criadas quando a conta entra no sistema.
- **Nota em conversa concluída funciona.** Nota não reabre a conversa.
- **Número de canal:** `"+55|11999990000"`, às vezes com 10 dígitos depois do DDI.
- **`companyId`:** vem no filtro de contatos (`POST /v1/contact/filter`) e nas assinaturas. Filtrar contatos por etiqueta numa conta grande estourou 20 s: o sistema não faz isso.
