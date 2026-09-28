# FluxoPro — Orquestrador de Aprovações Transversais

Pedidos de compra, reembolso, contratação e férias costumam ficar presos em e-mails, WhatsApp e chamados sem
visibilidade de gargalos. O FluxoPro centraliza todas as alçadas de decisão em uma caixa de aprovação mobile no
estilo "tinder": **arraste para a direita para aprovar e para a esquerda para rejeitar**.

## Recursos

| Recurso | Como funciona |
| --- | --- |
| **Centralização de pendências** | Conectores para **SAP** (requisição de compra, EBAN), **TOTVS Protheus** (SC1 compras, SRH férias, SQS vagas) e **Conta Azul** (reembolsos) convertem o formato nativo de cada ERP em uma solicitação única. A decisão final é devolvida ao ERP de origem. |
| **Aprovação em 1 toque com resumo financeiro** | Cada cartão mostra o impacto no orçamento da área (uso antes → depois). Se a aprovação estoura o orçamento, o app pergunta: *"Esta compra estoura o orçamento da área TI em 6,4% (R$ 25.400,00 acima do limite). Aprovar mesmo assim?"*. A API exige essa confirmação explícita (`409 BUDGET_CONFIRMATION_REQUIRED`) e registra na trilha que o aprovador estava ciente. |
| **Alçadas** | Cada usuário tem um limite por tipo de pedido. Acima do limite, a aprovação segue para o nível superior, e o cartão avisa antes: "Acima da sua alçada: ao aprovar, segue para Ricardo Menezes". |
| **Matriz de delegação automática** | Se o aprovador não responde em **48h** (configurável, inclusive por tipo), a solicitação sobe automaticamente para o nível superior. Ausências programadas transferem a fila para um substituto até a data escolhida. |
| **Visibilidade de gargalos** | O painel mostra pendências, itens fora do SLA, escalonamentos, tempo médio até a decisão e o ranking de aprovadores com filas paradas. |

## Rodando

Requer Node 20+.

```bash
npm install
npm run dev        # API em :3333 e app em http://localhost:5173
```

Produção (a API também serve o app compilado):

```bash
npm run build
npm start          # http://localhost:3333
```

Use o seletor no topo para trocar de usuário. A empresa de demonstração tem gerentes, diretores e uma CEO. No
início, uma solicitação já passou das 48h e foi escalonada, e outra está perto de vencer.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3333` | Porta HTTP |
| `SLA_HOURS` | `48` | Horas até escalar para o nível superior |
| `SYNC_INTERVAL_MS` | `300000` | Intervalo de sincronização com os ERPs |
| `ESCALATION_INTERVAL_MS` | `60000` | Intervalo da verificação de SLA |
| `DEMO_BACKDATE` | `true` | Envelhece duas solicitações de exemplo para mostrar o escalonamento |

```bash
npm test           # testes de domínio, conectores e API (vitest)
npm run typecheck
```

## Arquitetura

```
server/src
├── domain/
│   ├── types.ts            # modelo: solicitação, usuário (alçadas, delegação), área (orçamento)
│   ├── budget.ts           # análise de impacto orçamentário e mensagem resumida
│   ├── delegation.ts       # SLA, resolução de substitutos, próximo nível, alçada
│   └── approvalService.ts  # ingestão, decisão, encaminhamento, escalonamento, painel
├── connectors/             # adaptadores de ERP (SAP, TOTVS, Conta Azul)
├── store/memoryStore.ts    # persistência em memória (trocável por banco de dados)
├── http/app.ts             # API REST (Express)
├── seed.ts                 # empresa e dados de demonstração
└── index.ts                # servidor + jobs de sincronização e escalonamento
web/src                     # app React mobile-first (cartões com gesto de arrastar)
```

### API

Endpoints marcados com 🔑 identificam o usuário pelo cabeçalho `x-user-id`.

| Método | Rota | |
| --- | --- | --- |
| GET | `/api/inbox` 🔑 | Fila do aprovador, ordenada pelo prazo de SLA, com impacto orçamentário |
| GET | `/api/history` 🔑 | Solicitações em que o usuário já atuou |
| GET | `/api/requests/:id` | Detalhe e trilha de auditoria |
| POST | `/api/requests/:id/decision` 🔑 | `{ decision: "approve" \| "reject", comment?, confirmOverBudget? }` |
| PUT / DELETE | `/api/me/delegation` 🔑 | Define ou encerra a ausência: `{ userId, until }` |
| POST | `/api/sync` | Importa pendências dos ERPs (sem duplicar) |
| POST | `/api/escalations/run` | Executa a verificação de SLA imediatamente |
| GET | `/api/dashboard` | Indicadores e gargalos |
| GET | `/api/users`, `/api/areas`, `/api/connectors` | Cadastros |

### Levando para produção

- **Conectores reais:** os conectores de demonstração estendem `MockConnector`. Para usar um ERP real, implemente
  `fetchPending`/`pushDecision` com a API do ERP (SAP OData, TOTVS REST, API Conta Azul) e reaproveite o
  mapeamento `toIncoming`.
- **Persistência:** substitua o `MemoryStore` por um repositório com banco de dados que mantenha os mesmos métodos.
- **Autenticação:** o cabeçalho `x-user-id` é só para a demonstração. Troque `currentUser` em `http/app.ts` por
  validação de SSO/JWT.
- **Notificações:** os pontos de encaminhamento e escalonamento no `ApprovalService` são onde entram push, e-mail
  ou WhatsApp.
