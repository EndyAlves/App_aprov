import { describe, expect, it } from 'vitest';
import { analyzeBudget } from '../src/domain/budget.js';
import type { Area } from '../src/domain/types.js';

const area = (limit: number, committed: number): Area => ({
  id: 'ti',
  name: 'TI',
  approverId: 'x',
  budget: { period: 'P', limitCents: limit, committedCents: committed },
});

describe('analyzeBudget', () => {
  it('reports the overrun as a share of the area budget', () => {
    const impact = analyzeBudget(area(100_000_00, 95_000_00), { type: 'purchase', amountCents: 10_000_00 });
    expect(impact.exceeds).toBe(true);
    expect(impact.severity).toBe('critical');
    expect(impact.overrunCents).toBe(5_000_00);
    expect(impact.overrunPercent).toBeCloseTo(5);
    expect(impact.message).toBe(
      'Esta compra estoura o orçamento da área TI em 5% (R$ 5.000,00 acima do limite).',
    );
  });

  it('warns when the request consumes the last 10% of the budget', () => {
    const impact = analyzeBudget(area(100_000_00, 85_000_00), { type: 'reimbursement', amountCents: 7_000_00 });
    expect(impact.severity).toBe('warning');
    expect(impact.exceeds).toBe(false);
    expect(impact.message).toContain('Este reembolso leva a área TI a 92%');
    expect(impact.message).toContain('R$ 8.000,00');
  });

  it('is ok when comfortably inside the budget', () => {
    const impact = analyzeBudget(area(100_000_00, 10_000_00), { type: 'hiring', amountCents: 5_000_00 });
    expect(impact.severity).toBe('ok');
    expect(impact.message).toContain('de 10% para 15%');
  });

  it('ignores vacation and areas without budget', () => {
    expect(analyzeBudget(area(100, 0), { type: 'vacation', amountCents: 0 }).severity).toBe('none');
    expect(analyzeBudget(undefined, { type: 'purchase', amountCents: 1 }).severity).toBe('none');
    expect(analyzeBudget(area(0, 0), { type: 'purchase', amountCents: 1 }).exceeds).toBe(false);
  });
});
