import { toCents } from '../domain/money.js';
import type { IncomingRequest } from '../domain/types.js';
import { MockConnector } from './mockConnector.js';

/** Expense/reimbursement as exposed by the Conta Azul API. */
export interface ContaAzulExpense {
  id: string;
  description: string;
  value: number;
  category: string;
  cost_center: string;
  requester: { name: string };
  created_at: string;
  attachments: number;
}

export class ContaAzulConnector extends MockConnector<ContaAzulExpense> {
  readonly source = 'contaazul' as const;
  readonly label = 'Conta Azul';

  protected toIncoming(r: ContaAzulExpense): IncomingRequest {
    return {
      source: this.source,
      externalId: r.id,
      type: 'reimbursement',
      title: r.description,
      description: `Reembolso na categoria ${r.category} com ${r.attachments} comprovante(s).`,
      requesterName: r.requester.name,
      areaId: this.area(r.cost_center),
      amountCents: toCents(r.value),
      createdAt: new Date(r.created_at).toISOString(),
      metadata: { categoria: r.category, comprovantes: r.attachments },
    };
  }
}
