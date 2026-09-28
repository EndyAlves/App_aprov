import type { IncomingRequest, RequestStatus, SourceSystem } from '../domain/types.js';

export interface DecisionCallback {
  externalId: string;
  status: Exclude<RequestStatus, 'pending'>;
  approverName: string;
  comment?: string;
  decidedAt: string;
}

/**
 * Adapter between an ERP and FluxoPro. Each connector translates the ERP's
 * native payload into an IncomingRequest and writes the final decision back.
 */
export interface ErpConnector {
  readonly source: SourceSystem;
  readonly label: string;
  fetchPending(): Promise<IncomingRequest[]>;
  pushDecision(decision: DecisionCallback): Promise<void>;
}
