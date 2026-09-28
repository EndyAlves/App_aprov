import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app.js';
import { incoming, setup } from './helpers.js';

describe('HTTP API', () => {
  it('serves the inbox and returns 409 with the budget impact when confirmation is needed', async () => {
    const { service } = setup();
    const req = service.ingest(incoming({ amountCents: 30_000_00 }))!;
    const app = createApp(service);

    await request(app).get('/api/inbox').expect(401);

    const inbox = await request(app).get('/api/inbox').set('x-user-id', 'ger-ti').expect(200);
    expect(inbox.body[0]).toMatchObject({ id: req.id, budget: { exceeds: true, severity: 'critical' } });

    const conflict = await request(app)
      .post(`/api/requests/${req.id}/decision`)
      .set('x-user-id', 'ger-ti')
      .send({ decision: 'approve' })
      .expect(409);
    expect(conflict.body).toMatchObject({ code: 'BUDGET_CONFIRMATION_REQUIRED', details: { exceeds: true } });

    const ok = await request(app)
      .post(`/api/requests/${req.id}/decision`)
      .set('x-user-id', 'ger-ti')
      .send({ decision: 'approve', confirmOverBudget: true })
      .expect(200);
    expect(ok.body.status).toBe('approved');
  });

  it('validates input and exposes sync, escalation, delegation and dashboard', async () => {
    const { service, advance } = setup();
    const app = createApp(service);

    expect((await request(app).post('/api/sync').expect(200)).body.imported).toBe(10);
    await request(app)
      .post('/api/requests/REQ-00001/decision')
      .set('x-user-id', 'ger-ti')
      .send({ decision: 'maybe' })
      .expect(400);
    await request(app).get('/api/requests/NOPE').expect(404);
    await request(app).get('/api/nope').expect(404);

    advance(48);
    const esc = await request(app).post('/api/escalations/run').expect(200);
    expect(esc.body.escalated).toHaveLength(10);

    const del = await request(app)
      .put('/api/me/delegation')
      .set('x-user-id', 'dir-ops')
      .send({ userId: 'dir-com', until: '2026-12-01T00:00:00Z' })
      .expect(200);
    expect(del.body.moved).toBeGreaterThan(0);

    const dash = await request(app).get('/api/dashboard').expect(200);
    expect(dash.body.escalations).toBe(10);
  });
});
