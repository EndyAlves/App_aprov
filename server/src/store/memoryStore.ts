import type { ApprovalRequest, Area, SourceSystem, User } from '../domain/types.js';

/**
 * In-memory persistence. The service only depends on this class's methods, so
 * swapping it for a database-backed repository does not touch the domain code.
 */
export class MemoryStore {
  private users = new Map<string, User>();
  private areas = new Map<string, Area>();
  private requests = new Map<string, ApprovalRequest>();
  private seq = 0;

  constructor(seed: { users?: User[]; areas?: Area[] } = {}) {
    seed.users?.forEach((u) => this.users.set(u.id, structuredClone(u)));
    seed.areas?.forEach((a) => this.areas.set(a.id, structuredClone(a)));
  }

  nextRequestId(): string {
    this.seq += 1;
    return `REQ-${String(this.seq).padStart(5, '0')}`;
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  listUsers(): User[] {
    return [...this.users.values()];
  }

  saveUser(user: User): void {
    this.users.set(user.id, user);
  }

  getArea(id: string): Area | undefined {
    return this.areas.get(id);
  }

  listAreas(): Area[] {
    return [...this.areas.values()];
  }

  saveArea(area: Area): void {
    this.areas.set(area.id, area);
  }

  getRequest(id: string): ApprovalRequest | undefined {
    return this.requests.get(id);
  }

  findByExternal(source: SourceSystem, externalId: string): ApprovalRequest | undefined {
    for (const r of this.requests.values()) {
      if (r.source === source && r.externalId === externalId) return r;
    }
    return undefined;
  }

  listRequests(filter: (r: ApprovalRequest) => boolean = () => true): ApprovalRequest[] {
    return [...this.requests.values()].filter(filter);
  }

  saveRequest(request: ApprovalRequest): void {
    this.requests.set(request.id, request);
  }
}
