import { ApprovalService } from '../src/domain/approvalService.js';
import type { IncomingRequest } from '../src/domain/types.js';
import { demoAreas, demoConnectors, demoUsers } from '../src/seed.js';
import { MemoryStore } from '../src/store/memoryStore.js';

export const HOUR = 3_600_000;

export function setup(start = '2026-09-28T12:00:00Z') {
  const clock = { now: new Date(start) };
  const connectors = demoConnectors();
  const service = new ApprovalService({
    store: new MemoryStore({ users: demoUsers, areas: demoAreas }),
    connectors,
    now: () => clock.now,
  });
  const advance = (hours: number) => {
    clock.now = new Date(clock.now.getTime() + hours * HOUR);
  };
  return { service, connectors, clock, advance };
}

export function incoming(overrides: Partial<IncomingRequest> = {}): IncomingRequest {
  return {
    source: 'manual',
    externalId: `ext-${Math.random().toString(36).slice(2)}`,
    type: 'purchase',
    title: 'Monitores',
    description: '',
    requesterName: 'Fulano',
    areaId: 'ti',
    amountCents: 1_000_00,
    createdAt: '2026-09-28T12:00:00Z',
    ...overrides,
  };
}
