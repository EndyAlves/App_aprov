/** Kinds of decision FluxoPro orchestrates. */
export type RequestType = 'purchase' | 'reimbursement' | 'hiring' | 'vacation';

/** Where a request originated. */
export type SourceSystem = 'sap' | 'totvs' | 'contaazul' | 'manual';

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export type HistoryAction =
  | 'created'
  | 'approved'
  | 'forwarded'
  | 'rejected'
  | 'escalated'
  | 'delegated';

export interface Delegation {
  /** Who answers on this user's behalf. */
  userId: string;
  /** ISO timestamp; delegation is ignored after it. */
  until: string;
}

export interface User {
  id: string;
  name: string;
  role: string;
  /** Next level in the hierarchy; null for the top of the chain. */
  managerId: string | null;
  /**
   * Alçada: the largest amount (in cents) the user may approve alone, per type.
   * A missing entry means the user cannot close that type and must forward it.
   * Use `null` for "no limit".
   */
  approvalLimits: Partial<Record<RequestType, number | null>>;
  /** Out-of-office delegation. */
  delegation?: Delegation;
}

export interface Area {
  id: string;
  name: string;
  /** First approver for requests from this area. */
  approverId: string;
  budget: {
    period: string;
    limitCents: number;
    /** Already consumed or committed in the period. */
    committedCents: number;
  };
}

export interface HistoryEntry {
  at: string;
  action: HistoryAction;
  actorId: string | null;
  /** Who holds the request after this entry. */
  toUserId?: string | null;
  note?: string;
}

/** A request as it arrives from any source, before FluxoPro assigns it. */
export interface IncomingRequest {
  source: SourceSystem;
  externalId: string;
  type: RequestType;
  title: string;
  description: string;
  requesterName: string;
  areaId: string;
  amountCents: number;
  createdAt: string;
  metadata?: Record<string, string | number>;
}

export interface ApprovalRequest extends IncomingRequest {
  id: string;
  status: RequestStatus;
  currentApproverId: string | null;
  /** When the current approver received it; drives the SLA clock. */
  assignedAt: string;
  decidedAt?: string;
  escalations: number;
  history: HistoryEntry[];
}

export type Decision = 'approve' | 'reject';
