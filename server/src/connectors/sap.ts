import { toCents } from '../domain/money.js';
import type { IncomingRequest } from '../domain/types.js';
import { MockConnector } from './mockConnector.js';

/** SAP purchase requisition item (table EBAN), as returned by the OData service. */
export interface SapPurchaseRequisition {
  BANFN: string; // requisition number
  BNFPO: string; // item
  TXZ01: string; // short text
  MENGE: number; // quantity
  PREIS: number; // valuation price
  PEINH: number; // price unit
  WAERS: string; // currency
  KOSTL: string; // cost center
  AFNAM: string; // requisitioner
  BADAT: string; // request date, YYYY-MM-DD
}

export class SapConnector extends MockConnector<SapPurchaseRequisition> {
  readonly source = 'sap' as const;
  readonly label = 'SAP S/4HANA';

  protected toIncoming(r: SapPurchaseRequisition): IncomingRequest {
    const total = (r.MENGE * r.PREIS) / (r.PEINH || 1);
    return {
      source: this.source,
      externalId: `${r.BANFN}/${r.BNFPO}`,
      type: 'purchase',
      title: r.TXZ01,
      description: `Requisição de compra ${r.BANFN}, item ${r.BNFPO}: ${r.MENGE} un.`,
      requesterName: r.AFNAM,
      areaId: this.area(r.KOSTL),
      amountCents: toCents(total),
      createdAt: new Date(`${r.BADAT}T00:00:00Z`).toISOString(),
      metadata: { quantidade: r.MENGE, centroDeCusto: r.KOSTL, moeda: r.WAERS },
    };
  }
}
