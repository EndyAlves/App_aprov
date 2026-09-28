import type { RequestType, User } from './types.js';

export interface SlaPolicy {
  /** Hours an approver has before the request climbs one level. */
  defaultHours: number;
  byType?: Partial<Record<RequestType, number>>;
}

export const DEFAULT_SLA: SlaPolicy = { defaultHours: 48 };

const HOUR_MS = 60 * 60 * 1000;

export function slaHours(policy: SlaPolicy, type: RequestType): number {
  return policy.byType?.[type] ?? policy.defaultHours;
}

export function slaDeadline(policy: SlaPolicy, type: RequestType, assignedAt: string): Date {
  return new Date(new Date(assignedAt).getTime() + slaHours(policy, type) * HOUR_MS);
}

export function isOverdue(
  policy: SlaPolicy,
  type: RequestType,
  assignedAt: string,
  now: Date,
): boolean {
  return now.getTime() >= slaDeadline(policy, type, assignedAt).getTime();
}

type UserLookup = (id: string) => User | undefined;

function activeDelegate(user: User, now: Date): string | null {
  const d = user.delegation;
  if (!d || new Date(d.until).getTime() <= now.getTime()) return null;
  return d.userId;
}

/**
 * Follows out-of-office delegations until reaching someone who is available.
 * Cycles (A → B → A) stop at the last user before the loop closes.
 */
export function resolveApprover(getUser: UserLookup, userId: string, now: Date): string {
  const seen = new Set<string>([userId]);
  let current = userId;
  for (;;) {
    const user = getUser(current);
    const next = user ? activeDelegate(user, now) : null;
    if (!next || seen.has(next) || !getUser(next)) return current;
    seen.add(next);
    current = next;
  }
}

/** The next level above `userId`, already resolved through delegations; null at the top. */
export function nextLevel(getUser: UserLookup, userId: string, now: Date): string | null {
  const managerId = getUser(userId)?.managerId;
  return managerId ? resolveApprover(getUser, managerId, now) : null;
}

/** Whether `user` can close a request of this type and amount without forwarding it. */
export function withinAuthority(user: User, type: RequestType, amountCents: number): boolean {
  const limit = user.approvalLimits[type];
  if (limit === undefined) return false;
  return limit === null || amountCents <= limit;
}
