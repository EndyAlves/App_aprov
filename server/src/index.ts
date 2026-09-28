import { fileURLToPath } from 'node:url';
import { ApprovalService } from './domain/approvalService.js';
import { createApp } from './http/app.js';
import { backdateDemo, demoAreas, demoConnectors, demoUsers } from './seed.js';
import { MemoryStore } from './store/memoryStore.js';

const port = Number(process.env.PORT ?? 3333);
const slaHours = Number(process.env.SLA_HOURS ?? 48);
const syncEveryMs = Number(process.env.SYNC_INTERVAL_MS ?? 5 * 60_000);
const escalateEveryMs = Number(process.env.ESCALATION_INTERVAL_MS ?? 60_000);

const service = new ApprovalService({
  store: new MemoryStore({ users: demoUsers, areas: demoAreas }),
  connectors: demoConnectors(),
  sla: { defaultHours: slaHours },
});

await service.sync();
if (process.env.DEMO_BACKDATE !== 'false') {
  backdateDemo(service.store);
  service.escalateOverdue();
}

// Background jobs: pull new items from the ERPs and climb overdue ones up the hierarchy.
setInterval(() => void service.sync().catch((e) => console.error('[sync]', e)), syncEveryMs).unref();
setInterval(() => {
  const escalated = service.escalateOverdue();
  if (escalated.length) console.log(`[escalonamento] ${escalated.map((r) => r.id).join(', ')}`);
}, escalateEveryMs).unref();

const staticDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
createApp(service, { staticDir }).listen(port, () => {
  console.log(`FluxoPro API em http://localhost:${port} (SLA ${slaHours}h)`);
});
