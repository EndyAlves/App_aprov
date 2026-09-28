import { describe, expect, it } from 'vitest';
import { resolveApprover, withinAuthority } from '../src/domain/delegation.js';
import type { User } from '../src/domain/types.js';

const now = new Date('2026-09-28T12:00:00Z');
const user = (id: string, extra: Partial<User> = {}): User => ({
  id,
  name: id,
  role: '',
  managerId: null,
  approvalLimits: {},
  ...extra,
});

describe('resolveApprover', () => {
  it('follows active delegations and ignores expired ones', () => {
    const users = new Map([
      ['a', user('a', { delegation: { userId: 'b', until: '2026-10-01T00:00:00Z' } })],
      ['b', user('b', { delegation: { userId: 'c', until: '2026-09-01T00:00:00Z' } })],
      ['c', user('c')],
    ]);
    expect(resolveApprover((id) => users.get(id), 'a', now)).toBe('b');
  });

  it('stops on delegation cycles', () => {
    const users = new Map([
      ['a', user('a', { delegation: { userId: 'b', until: '2027-01-01T00:00:00Z' } })],
      ['b', user('b', { delegation: { userId: 'a', until: '2027-01-01T00:00:00Z' } })],
    ]);
    expect(resolveApprover((id) => users.get(id), 'a', now)).toBe('b');
  });
});

describe('withinAuthority', () => {
  it('respects per-type limits, unlimited and missing types', () => {
    const u = user('u', { approvalLimits: { purchase: 100, vacation: null } });
    expect(withinAuthority(u, 'purchase', 100)).toBe(true);
    expect(withinAuthority(u, 'purchase', 101)).toBe(false);
    expect(withinAuthority(u, 'vacation', 0)).toBe(true);
    expect(withinAuthority(u, 'hiring', 1)).toBe(false);
  });
});
