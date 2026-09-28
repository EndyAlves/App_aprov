import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/approvalService.js';
import { incoming, setup } from './helpers.js';

describe('ApprovalService', () => {
  it('imports every ERP once and routes items to the area approver', async () => {
    const { service } = setup();
    const first = await service.sync();
    expect(first).toMatchObject({ imported: 10, duplicates: 0, errors: [] });
    expect(first.bySource).toEqual({ sap: 3, totvs: 4, contaazul: 3 });
    expect((await service.sync()).imported).toBe(0);
    expect(service.inbox('ger-ti').map((r) => r.source).sort()).toEqual(['contaazul', 'sap', 'sap', 'totvs']);
  });

  it('closes a request within the approver alçada and writes back to the ERP', async () => {
    const { service, connectors } = setup();
    await service.sync();
    const req = service.inbox('ger-log').find((r) => r.externalId === 'SC1-004512-0001')!;
    const result = await service.decide(req.id, 'ger-log', { decision: 'approve' });
    expect(result.status).toBe('approved');
    expect(service.store.getArea('logistica')!.budget.committedCents).toBe(510_000_00 + 18_750_00);
    expect(connectors[1].outbox).toEqual([
      expect.objectContaining({ externalId: 'SC1-004512-0001', status: 'approved', approverName: 'Camila Rocha' }),
    ]);
  });

  it('forwards to the next level when the amount exceeds the alçada', async () => {
    const { service } = setup();
    await service.sync();
    const forklift = service.inbox('ger-log').find((r) => r.externalId === '0010004571/00010')!;
    expect(forklift.forwardsTo?.id).toBe('dir-ops');

    const afterManager = await service.decide(forklift.id, 'ger-log', { decision: 'approve' });
    expect(afterManager).toMatchObject({ status: 'pending', currentApproverId: 'dir-ops' });
    expect(service.inbox('dir-ops').map((r) => r.id)).toContain(forklift.id);

    const afterDirector = await service.decide(forklift.id, 'dir-ops', { decision: 'approve' });
    expect(afterDirector.status).toBe('approved');
    expect(afterDirector.history.map((h) => h.action)).toEqual(['created', 'forwarded', 'approved']);
  });

  it('asks for explicit confirmation before approving over budget', async () => {
    const { service } = setup();
    // TI: 372k of 400k used. 30k purchase → 2k over (0,5%).
    const req = service.ingest(incoming({ amountCents: 30_000_00 }))!;

    const err = await service.decide(req.id, 'ger-ti', { decision: 'approve' }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('BUDGET_CONFIRMATION_REQUIRED');
    expect(err.message).toBe(
      'Esta compra estoura o orçamento da área TI em 0,5% (R$ 2.000,00 acima do limite). Aprovar mesmo assim?',
    );
    expect(service.get(req.id).status).toBe('pending');

    const ok = await service.decide(req.id, 'ger-ti', { decision: 'approve', confirmOverBudget: true });
    expect(ok.status).toBe('approved');
    expect(ok.history.at(-1)!.note).toContain('ciente de estouro de 0,5%');
  });

  it('rejects in one step and blocks anyone but the current approver', async () => {
    const { service, connectors } = setup();
    await service.sync();
    const req = service.inbox('ger-mkt')[0];

    await expect(service.decide(req.id, 'ger-ti', { decision: 'reject' })).rejects.toMatchObject({
      code: 'NOT_CURRENT_APPROVER',
    });
    const rejected = await service.decide(req.id, 'ger-mkt', { decision: 'reject', comment: 'Sem verba' });
    expect(rejected.status).toBe('rejected');
    await expect(service.decide(req.id, 'ger-mkt', { decision: 'approve' })).rejects.toMatchObject({
      code: 'ALREADY_DECIDED',
    });
    expect(connectors.flatMap((c) => c.outbox)).toEqual([
      expect.objectContaining({ status: 'rejected', comment: 'Sem verba' }),
    ]);
  });

  it('escalates unanswered requests one level every 48h, up to the top', () => {
    const { service, advance } = setup();
    const req = service.ingest(incoming({ amountCents: 100_00 }))!;

    advance(47.9);
    expect(service.escalateOverdue()).toHaveLength(0);

    advance(0.1);
    expect(service.escalateOverdue().map((r) => r.id)).toEqual([req.id]);
    expect(service.get(req.id)).toMatchObject({ currentApproverId: 'dir-ops', escalations: 1 });
    expect(service.get(req.id).history.at(-1)!.note).toBe('Sem resposta de Bruno Tavares em 48h');

    advance(48);
    service.escalateOverdue();
    expect(service.get(req.id).currentApproverId).toBe('ceo');

    advance(48);
    expect(service.escalateOverdue()).toHaveLength(0);
    expect(service.get(req.id)).toMatchObject({ currentApproverId: 'ceo', overdue: true, escalations: 2 });
    expect(service.dashboard().bottlenecks[0]).toMatchObject({ user: { id: 'ceo' }, overdue: 1 });
  });

  it('honours per-type SLA overrides', () => {
    const { service, advance } = setup();
    (service.sla as { byType?: object }).byType = { reimbursement: 24 };
    service.ingest(incoming({ type: 'reimbursement', amountCents: 100_00 }));
    advance(24);
    expect(service.escalateOverdue()).toHaveLength(1);
  });

  it('moves the queue to the substitute during an absence', async () => {
    const { service } = setup();
    await service.sync();
    const before = service.inbox('ger-ti').length;

    const { moved } = service.setDelegation('ger-ti', { userId: 'ger-log', until: '2026-10-10T00:00:00Z' });
    expect(moved).toBe(before);
    expect(service.inbox('ger-ti')).toHaveLength(0);

    const fresh = service.ingest(incoming())!;
    expect(fresh.currentApproverId).toBe('ger-log');
    expect(fresh.history.map((h) => h.action)).toEqual(['created', 'delegated']);

    expect(() => service.setDelegation('ger-ti', { userId: 'ger-ti', until: '2026-10-10T00:00:00Z' })).toThrow(
      DomainError,
    );
    expect(() => service.setDelegation('ger-ti', { userId: 'ger-log', until: '2020-01-01T00:00:00Z' })).toThrow(
      DomainError,
    );
  });

  it('reports bottlenecks ordered by overdue items and age', async () => {
    const { service, advance } = setup();
    await service.sync();
    advance(49);
    service.ingest(incoming({ areaId: 'marketing' }));
    const d = service.dashboard();
    expect(d.totals).toMatchObject({ pending: 11, overdue: 10 });
    expect(d.bottlenecks[0]).toMatchObject({ user: { id: 'ger-ti' }, pending: 4, overdue: 4 });
    expect(d.pendingBySource).toEqual({ sap: 3, totvs: 4, contaazul: 3, manual: 1 });
  });

  it('keeps the decision when the ERP write-back fails', async () => {
    const errors: unknown[] = [];
    const { service, connectors } = setup();
    Object.assign(service, { onConnectorError: (e: unknown) => errors.push(e) });
    connectors[2].pushDecision = async () => {
      throw new Error('timeout');
    };
    await service.sync();
    const req = service.inbox('ger-mkt').find((r) => r.source === 'contaazul')!;
    expect((await service.decide(req.id, 'ger-mkt', { decision: 'approve' })).status).toBe('approved');
    expect(errors).toHaveLength(1);
  });
});
