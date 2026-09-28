import type { ErpConnector } from '../connectors/types.js';
import type { MemoryStore } from '../store/memoryStore.js';
import { analyzeBudget, consumesBudget, type BudgetImpact } from './budget.js';
import {
  DEFAULT_SLA,
  isOverdue,
  nextLevel,
  resolveApprover,
  slaDeadline,
  withinAuthority,
  type SlaPolicy,
} from './delegation.js';
import { formatPercent } from './money.js';
import type {
  ApprovalRequest,
  Decision,
  Delegation,
  HistoryEntry,
  IncomingRequest,
  RequestType,
  SourceSystem,
  User,
} from './types.js';

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface UserSummary {
  id: string;
  name: string;
  role: string;
}

export interface RequestView extends ApprovalRequest {
  budget: BudgetImpact;
  slaDeadline: string;
  overdue: boolean;
  currentApprover: UserSummary | null;
  /** Set when the current approver's alçada is too low: approving forwards to this user. */
  forwardsTo: UserSummary | null;
}

export interface DecideInput {
  decision: Decision;
  comment?: string;
  /** Required to approve a request that exceeds the area budget. */
  confirmOverBudget?: boolean;
}

export interface SyncResult {
  imported: number;
  duplicates: number;
  errors: string[];
  bySource: Partial<Record<SourceSystem, number>>;
}

export interface ApproverLoad {
  user: UserSummary;
  pending: number;
  overdue: number;
  oldestHours: number;
  avgWaitHours: number;
}

export interface Dashboard {
  totals: { pending: number; approved: number; rejected: number; overdue: number };
  pendingAmountCents: number;
  pendingBySource: Partial<Record<SourceSystem, number>>;
  pendingByType: Partial<Record<RequestType, number>>;
  escalations: number;
  avgDecisionHours: number | null;
  /** Approvers ordered from the worst bottleneck to the best. */
  bottlenecks: ApproverLoad[];
}

export interface ServiceOptions {
  store: MemoryStore;
  connectors?: ErpConnector[];
  sla?: SlaPolicy;
  now?: () => Date;
  onConnectorError?: (err: unknown, request: ApprovalRequest) => void;
}

const HOUR_MS = 60 * 60 * 1000;

function summary(user: User | undefined): UserSummary | null {
  return user ? { id: user.id, name: user.name, role: user.role } : null;
}

export class ApprovalService {
  readonly store: MemoryStore;
  readonly sla: SlaPolicy;
  private readonly connectors: Map<SourceSystem, ErpConnector>;
  private readonly now: () => Date;
  private readonly onConnectorError: (err: unknown, request: ApprovalRequest) => void;

  constructor(opts: ServiceOptions) {
    this.store = opts.store;
    this.sla = opts.sla ?? DEFAULT_SLA;
    this.connectors = new Map((opts.connectors ?? []).map((c) => [c.source, c]));
    this.now = opts.now ?? (() => new Date());
    this.onConnectorError =
      opts.onConnectorError ??
      ((err, r) => console.error(`[fluxopro] falha ao devolver decisão de ${r.id} ao ERP`, err));
  }

  private getUser = (id: string) => this.store.getUser(id);

  listConnectors(): { source: SourceSystem; label: string }[] {
    return [...this.connectors.values()].map((c) => ({ source: c.source, label: c.label }));
  }

  // ---------------------------------------------------------------- ingestion

  /** Registers a request and routes it to the area's first approver. Returns null for duplicates. */
  ingest(incoming: IncomingRequest): ApprovalRequest | null {
    if (this.store.findByExternal(incoming.source, incoming.externalId)) return null;

    const area = this.store.getArea(incoming.areaId);
    if (!area) {
      throw new DomainError('UNKNOWN_AREA', `Área "${incoming.areaId}" não cadastrada.`, 422);
    }

    const now = this.now();
    const at = now.toISOString();
    const approverId = resolveApprover(this.getUser, area.approverId, now);
    const origin = this.connectors.get(incoming.source)?.label ?? incoming.source;
    const history: HistoryEntry[] = [
      { at, action: 'created', actorId: null, toUserId: area.approverId, note: `Recebido de ${origin}` },
    ];
    if (approverId !== area.approverId) {
      history.push({
        at,
        action: 'delegated',
        actorId: area.approverId,
        toUserId: approverId,
        note: 'Aprovador ausente; encaminhado ao substituto',
      });
    }

    const request: ApprovalRequest = {
      ...incoming,
      id: this.store.nextRequestId(),
      status: 'pending',
      currentApproverId: approverId,
      assignedAt: at,
      escalations: 0,
      history,
    };
    this.store.saveRequest(request);
    return request;
  }

  /** Pulls pending items from every connected ERP. */
  async sync(): Promise<SyncResult> {
    const result: SyncResult = { imported: 0, duplicates: 0, errors: [], bySource: {} };
    for (const connector of this.connectors.values()) {
      let items: IncomingRequest[];
      try {
        items = await connector.fetchPending();
      } catch (err) {
        result.errors.push(`${connector.label}: ${(err as Error).message}`);
        continue;
      }
      for (const item of items) {
        try {
          if (this.ingest(item)) {
            result.imported += 1;
            result.bySource[item.source] = (result.bySource[item.source] ?? 0) + 1;
          } else {
            result.duplicates += 1;
          }
        } catch (err) {
          result.errors.push(`${connector.label} ${item.externalId}: ${(err as Error).message}`);
        }
      }
    }
    return result;
  }

  // -------------------------------------------------------------------- reads

  view(request: ApprovalRequest): RequestView {
    const now = this.now();
    const approver = request.currentApproverId ? this.store.getUser(request.currentApproverId) : undefined;
    let forwardsTo: UserSummary | null = null;
    if (request.status === 'pending' && approver && !withinAuthority(approver, request.type, request.amountCents)) {
      const next = nextLevel(this.getUser, approver.id, now);
      forwardsTo = next ? summary(this.store.getUser(next)) : null;
    }
    return {
      ...structuredClone(request),
      budget: analyzeBudget(this.store.getArea(request.areaId), request),
      slaDeadline: slaDeadline(this.sla, request.type, request.assignedAt).toISOString(),
      overdue: request.status === 'pending' && isOverdue(this.sla, request.type, request.assignedAt, now),
      currentApprover: summary(approver),
      forwardsTo,
    };
  }

  get(id: string): RequestView {
    return this.view(this.require(id));
  }

  /** The approver's queue, most urgent (closest SLA deadline) first. */
  inbox(userId: string): RequestView[] {
    return this.store
      .listRequests((r) => r.status === 'pending' && r.currentApproverId === userId)
      .map((r) => this.view(r))
      .sort((a, b) => a.slaDeadline.localeCompare(b.slaDeadline));
  }

  /** Requests this user has already acted on. */
  history(userId: string, limit = 50): RequestView[] {
    return this.store
      .listRequests((r) => r.history.some((h) => h.actorId === userId && h.action !== 'created'))
      .map((r) => this.view(r))
      .sort((a, b) => (b.history.at(-1)?.at ?? '').localeCompare(a.history.at(-1)?.at ?? ''))
      .slice(0, limit);
  }

  // ------------------------------------------------------------------- writes

  async decide(requestId: string, actorId: string, input: DecideInput): Promise<RequestView> {
    const request = this.require(requestId);
    const actor = this.store.getUser(actorId);
    if (!actor) throw new DomainError('UNKNOWN_USER', 'Usuário não encontrado.', 401);
    if (request.status !== 'pending') {
      throw new DomainError('ALREADY_DECIDED', 'Esta solicitação já foi decidida.', 409);
    }
    if (request.currentApproverId !== actorId) {
      throw new DomainError('NOT_CURRENT_APPROVER', 'Esta solicitação não está na sua alçada.', 403);
    }

    const now = this.now();
    const at = now.toISOString();
    const comment = input.comment?.trim() || undefined;

    if (input.decision === 'reject') {
      request.status = 'rejected';
      request.decidedAt = at;
      request.currentApproverId = null;
      request.history.push({ at, action: 'rejected', actorId, note: comment });
      this.store.saveRequest(request);
      await this.writeBack(request, actor, comment);
      return this.view(request);
    }

    const area = this.store.getArea(request.areaId);
    const budget = analyzeBudget(area, request);
    if (budget.exceeds && !input.confirmOverBudget) {
      throw new DomainError(
        'BUDGET_CONFIRMATION_REQUIRED',
        `${budget.message} Aprovar mesmo assim?`,
        409,
        budget,
      );
    }
    const notes = [
      budget.exceeds ? `Aprovado ciente de estouro de ${formatPercent(budget.overrunPercent)} do orçamento` : '',
      comment ?? '',
    ].filter(Boolean);
    const note = notes.length ? notes.join(' — ') : undefined;

    const next = withinAuthority(actor, request.type, request.amountCents)
      ? null
      : nextLevel(this.getUser, actorId, now);

    if (next) {
      request.currentApproverId = next;
      request.assignedAt = at;
      request.history.push({ at, action: 'forwarded', actorId, toUserId: next, note });
      this.store.saveRequest(request);
      return this.view(request);
    }

    // Final approval (within alçada, or top of the chain).
    request.status = 'approved';
    request.decidedAt = at;
    request.currentApproverId = null;
    request.history.push({ at, action: 'approved', actorId, note });
    if (area && consumesBudget(request.type)) {
      area.budget.committedCents += request.amountCents;
      this.store.saveArea(area);
    }
    this.store.saveRequest(request);
    await this.writeBack(request, actor, comment);
    return this.view(request);
  }

  /**
   * Matriz de delegação: every pending request whose approver let the SLA
   * (48h by default) run out climbs one level in the hierarchy.
   */
  escalateOverdue(): ApprovalRequest[] {
    const now = this.now();
    const at = now.toISOString();
    const escalated: ApprovalRequest[] = [];

    for (const request of this.store.listRequests((r) => r.status === 'pending')) {
      if (!request.currentApproverId) continue;
      if (!isOverdue(this.sla, request.type, request.assignedAt, now)) continue;

      const from = request.currentApproverId;
      const to = nextLevel(this.getUser, from, now);
      if (!to || to === from) continue; // already at the top: stays overdue on the dashboard

      const hours = Math.round((now.getTime() - new Date(request.assignedAt).getTime()) / HOUR_MS);
      request.currentApproverId = to;
      request.assignedAt = at;
      request.escalations += 1;
      request.history.push({
        at,
        action: 'escalated',
        actorId: null,
        toUserId: to,
        note: `Sem resposta de ${this.store.getUser(from)?.name ?? from} em ${hours}h`,
      });
      this.store.saveRequest(request);
      escalated.push(request);
    }
    return escalated;
  }

  /**
   * Sets (or clears, with null) an out-of-office delegation and moves the
   * user's current queue to the substitute.
   */
  setDelegation(userId: string, delegation: Delegation | null): { user: UserSummary; moved: number } {
    const user = this.store.getUser(userId);
    if (!user) throw new DomainError('UNKNOWN_USER', 'Usuário não encontrado.', 404);

    if (!delegation) {
      delete user.delegation;
      this.store.saveUser(user);
      return { user: summary(user)!, moved: 0 };
    }

    if (delegation.userId === userId) {
      throw new DomainError('INVALID_DELEGATION', 'Não é possível delegar para si mesmo.');
    }
    if (!this.store.getUser(delegation.userId)) {
      throw new DomainError('UNKNOWN_USER', 'Substituto não encontrado.', 404);
    }
    const now = this.now();
    if (Number.isNaN(Date.parse(delegation.until)) || new Date(delegation.until) <= now) {
      throw new DomainError('INVALID_DELEGATION', 'A data final da delegação deve estar no futuro.');
    }

    user.delegation = { userId: delegation.userId, until: new Date(delegation.until).toISOString() };
    this.store.saveUser(user);

    const target = resolveApprover(this.getUser, userId, now);
    let moved = 0;
    if (target !== userId) {
      const at = now.toISOString();
      for (const r of this.store.listRequests((x) => x.status === 'pending' && x.currentApproverId === userId)) {
        r.currentApproverId = target;
        r.assignedAt = at;
        r.history.push({ at, action: 'delegated', actorId: userId, toUserId: target, note: 'Ausência programada' });
        this.store.saveRequest(r);
        moved += 1;
      }
    }
    return { user: summary(user)!, moved };
  }

  dashboard(): Dashboard {
    const now = this.now();
    const all = this.store.listRequests();
    const pending = all.filter((r) => r.status === 'pending');
    const decided = all.filter((r) => r.decidedAt);

    const pendingBySource: Dashboard['pendingBySource'] = {};
    const pendingByType: Dashboard['pendingByType'] = {};
    const loads = new Map<string, { pending: number; overdue: number; waits: number[] }>();
    let overdue = 0;

    for (const r of pending) {
      pendingBySource[r.source] = (pendingBySource[r.source] ?? 0) + 1;
      pendingByType[r.type] = (pendingByType[r.type] ?? 0) + 1;
      const late = isOverdue(this.sla, r.type, r.assignedAt, now);
      if (late) overdue += 1;
      if (!r.currentApproverId) continue;
      const load = loads.get(r.currentApproverId) ?? { pending: 0, overdue: 0, waits: [] };
      load.pending += 1;
      if (late) load.overdue += 1;
      load.waits.push((now.getTime() - new Date(r.assignedAt).getTime()) / HOUR_MS);
      loads.set(r.currentApproverId, load);
    }

    const round = (n: number) => Math.round(n * 10) / 10;
    const bottlenecks: ApproverLoad[] = [...loads.entries()]
      .map(([id, l]) => ({
        user: summary(this.store.getUser(id)) ?? { id, name: id, role: '' },
        pending: l.pending,
        overdue: l.overdue,
        oldestHours: round(Math.max(...l.waits)),
        avgWaitHours: round(l.waits.reduce((s, w) => s + w, 0) / l.waits.length),
      }))
      .sort((a, b) => b.overdue - a.overdue || b.oldestHours - a.oldestHours || b.pending - a.pending);

    const decisionHours = decided.map(
      (r) => (new Date(r.decidedAt!).getTime() - new Date(r.createdAt).getTime()) / HOUR_MS,
    );

    return {
      totals: {
        pending: pending.length,
        approved: all.filter((r) => r.status === 'approved').length,
        rejected: all.filter((r) => r.status === 'rejected').length,
        overdue,
      },
      pendingAmountCents: pending.reduce((s, r) => s + r.amountCents, 0),
      pendingBySource,
      pendingByType,
      escalations: all.reduce((s, r) => s + r.escalations, 0),
      avgDecisionHours: decisionHours.length
        ? round(decisionHours.reduce((s, h) => s + h, 0) / decisionHours.length)
        : null,
      bottlenecks,
    };
  }

  // ------------------------------------------------------------------ helpers

  private require(id: string): ApprovalRequest {
    const request = this.store.getRequest(id);
    if (!request) throw new DomainError('NOT_FOUND', 'Solicitação não encontrada.', 404);
    return request;
  }

  private async writeBack(request: ApprovalRequest, actor: User, comment?: string): Promise<void> {
    const connector = this.connectors.get(request.source);
    if (!connector || request.status === 'pending') return;
    try {
      await connector.pushDecision({
        externalId: request.externalId,
        status: request.status,
        approverName: actor.name,
        comment,
        decidedAt: request.decidedAt!,
      });
    } catch (err) {
      this.onConnectorError(err, request);
    }
  }
}
