import { formatBRL, formatPercent } from './money.js';
import type { Area, RequestType } from './types.js';

export type BudgetSeverity = 'none' | 'ok' | 'warning' | 'critical';

export interface BudgetImpact {
  severity: BudgetSeverity;
  /** True when approving pushes the area above its budget. */
  exceeds: boolean;
  areaName: string;
  limitCents: number;
  committedCents: number;
  requestCents: number;
  projectedCents: number;
  /** Share of the budget used before / after approving (0..n). */
  usageBefore: number;
  usageAfter: number;
  overrunCents: number;
  /** Overrun as a percentage of the area's budget. */
  overrunPercent: number;
  /** One-line summary shown on the approval card. */
  message: string;
}

/** Above this share of the budget a request is flagged even if it still fits. */
export const WARNING_USAGE = 0.9;

const NOUN: Record<RequestType, string> = {
  purchase: 'Esta compra',
  reimbursement: 'Este reembolso',
  hiring: 'Esta contratação',
  vacation: 'Estas férias',
};

/** Vacation requests do not consume the area budget. */
export function consumesBudget(type: RequestType): boolean {
  return type !== 'vacation';
}

export function analyzeBudget(
  area: Area | undefined,
  request: { type: RequestType; amountCents: number },
): BudgetImpact {
  const noun = NOUN[request.type];

  if (!area || !consumesBudget(request.type) || area.budget.limitCents <= 0) {
    return {
      severity: 'none',
      exceeds: false,
      areaName: area?.name ?? '—',
      limitCents: area?.budget.limitCents ?? 0,
      committedCents: area?.budget.committedCents ?? 0,
      requestCents: request.amountCents,
      projectedCents: area?.budget.committedCents ?? 0,
      usageBefore: 0,
      usageAfter: 0,
      overrunCents: 0,
      overrunPercent: 0,
      message: consumesBudget(request.type)
        ? 'Área sem orçamento cadastrado.'
        : `${noun} não impactam o orçamento da área.`,
    };
  }

  const { limitCents, committedCents } = area.budget;
  const projectedCents = committedCents + request.amountCents;
  const usageBefore = committedCents / limitCents;
  const usageAfter = projectedCents / limitCents;
  const overrunCents = Math.max(0, projectedCents - limitCents);
  const overrunPercent = (overrunCents / limitCents) * 100;
  const exceeds = overrunCents > 0;

  let severity: BudgetSeverity;
  let message: string;
  if (exceeds) {
    severity = 'critical';
    message =
      `${noun} estoura o orçamento da área ${area.name} em ${formatPercent(overrunPercent)} ` +
      `(${formatBRL(overrunCents)} acima do limite).`;
  } else if (usageAfter >= WARNING_USAGE) {
    severity = 'warning';
    message =
      `${noun} leva a área ${area.name} a ${formatPercent(usageAfter * 100)} do orçamento; ` +
      `restarão ${formatBRL(limitCents - projectedCents)}.`;
  } else {
    severity = 'ok';
    message =
      `Dentro do orçamento: a área ${area.name} passa de ${formatPercent(usageBefore * 100)} ` +
      `para ${formatPercent(usageAfter * 100)} do limite.`;
  }

  return {
    severity,
    exceeds,
    areaName: area.name,
    limitCents,
    committedCents,
    requestCents: request.amountCents,
    projectedCents,
    usageBefore,
    usageAfter,
    overrunCents,
    overrunPercent,
    message,
  };
}
