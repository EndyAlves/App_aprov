import type { IncomingRequest, SourceSystem } from '../domain/types.js';
import type { DecisionCallback, ErpConnector } from './types.js';

/**
 * Base for the demo connectors: keeps a list of native ERP records in memory and
 * records decisions written back, so the full round trip can be exercised
 * without real ERP credentials. A production connector replaces `records` with
 * API calls (SAP OData, TOTVS REST, Conta Azul API) but keeps `toIncoming`.
 */
export abstract class MockConnector<Native> implements ErpConnector {
  abstract readonly source: SourceSystem;
  abstract readonly label: string;
  readonly outbox: DecisionCallback[] = [];

  constructor(
    protected records: Native[],
    /** Maps the ERP cost center code to a FluxoPro area id. */
    protected costCenters: Record<string, string>,
  ) {}

  protected abstract toIncoming(record: Native): IncomingRequest;

  protected area(costCenter: string): string {
    return this.costCenters[costCenter] ?? costCenter;
  }

  async fetchPending(): Promise<IncomingRequest[]> {
    return this.records.map((r) => this.toIncoming(r));
  }

  async pushDecision(decision: DecisionCallback): Promise<void> {
    this.outbox.push(decision);
  }

  /** Simulates a new record appearing in the ERP. */
  add(record: Native): void {
    this.records.push(record);
  }
}
