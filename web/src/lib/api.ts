export type RequestType = 'purchase' | 'reimbursement' | 'hiring' | 'vacation';
export type SourceSystem = 'sap' | 'totvs' | 'contaazul' | 'manual';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface UserSummary {
  id: string;
  name: string;
  role: string;
}

export interface UserInfo extends UserSummary {
  managerId: string | null;
  delegation: { userId: string; until: string } | null;
}

export interface BudgetImpact {
  severity: 'none' | 'ok' | 'warning' | 'critical';
  exceeds: boolean;
  areaName: string;
  limitCents: number;
  committedCents: number;
  requestCents: number;
  projectedCents: number;
  usageBefore: number;
  usageAfter: number;
  overrunCents: number;
  overrunPercent: number;
  message: string;
}

export interface HistoryEntry {
  at: string;
  action: 'created' | 'approved' | 'forwarded' | 'rejected' | 'escalated' | 'delegated';
  actorId: string | null;
  toUserId?: string | null;
  note?: string;
}

export interface RequestView {
  id: string;
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
  status: RequestStatus;
  currentApproverId: string | null;
  assignedAt: string;
  decidedAt?: string;
  escalations: number;
  history: HistoryEntry[];
  budget: BudgetImpact;
  slaDeadline: string;
  overdue: boolean;
  currentApprover: UserSummary | null;
  forwardsTo: UserSummary | null;
}

export interface Dashboard {
  totals: { pending: number; approved: number; rejected: number; overdue: number };
  pendingAmountCents: number;
  pendingBySource: Partial<Record<SourceSystem, number>>;
  pendingByType: Partial<Record<RequestType, number>>;
  escalations: number;
  avgDecisionHours: number | null;
  bottlenecks: {
    user: UserSummary;
    pending: number;
    overdue: number;
    oldestHours: number;
    avgWaitHours: number;
  }[];
}

export interface SyncResult {
  imported: number;
  duplicates: number;
  errors: string[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function call<T>(path: string, userId: string | null, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (userId) headers['x-user-id'] = userId;
  const res = await fetch(`/api${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.code ?? 'HTTP', body.message ?? res.statusText, body.details);
  }
  return body as T;
}

export const api = {
  users: () => call<UserInfo[]>('/users', null),
  inbox: (userId: string) => call<RequestView[]>('/inbox', userId),
  history: (userId: string) => call<RequestView[]>('/history', userId),
  dashboard: () => call<Dashboard>('/dashboard', null),
  sync: () => call<SyncResult>('/sync', null, { method: 'POST' }),
  escalate: () => call<{ escalated: string[] }>('/escalations/run', null, { method: 'POST' }),
  decide: (
    userId: string,
    id: string,
    body: { decision: 'approve' | 'reject'; comment?: string; confirmOverBudget?: boolean },
  ) => call<RequestView>(`/requests/${id}/decision`, userId, { method: 'POST', body: JSON.stringify(body) }),
  setDelegation: (userId: string, delegateId: string, until: string) =>
    call<{ moved: number }>('/me/delegation', userId, {
      method: 'PUT',
      body: JSON.stringify({ userId: delegateId, until }),
    }),
  clearDelegation: (userId: string) => call<{ moved: number }>('/me/delegation', userId, { method: 'DELETE' }),
};
