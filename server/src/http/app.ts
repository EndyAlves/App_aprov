import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { ApprovalService, DomainError } from '../domain/approvalService.js';

/**
 * Identifies the caller. The demo trusts the `x-user-id` header; in production
 * this is where the SSO/JWT validation goes.
 */
function currentUser(service: ApprovalService, req: Request): string {
  const id = req.header('x-user-id');
  if (!id || !service.store.getUser(id)) {
    throw new DomainError('UNAUTHENTICATED', 'Informe um usuário válido no cabeçalho x-user-id.', 401);
  }
  return id;
}

export function createApp(service: ApprovalService, opts: { staticDir?: string } = {}) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/users', (_req, res) => {
    res.json(
      service.store.listUsers().map(({ id, name, role, managerId, delegation }) => ({
        id,
        name,
        role,
        managerId,
        delegation: delegation ?? null,
      })),
    );
  });

  app.get('/api/connectors', (_req, res) => {
    res.json(service.listConnectors());
  });

  app.get('/api/areas', (_req, res) => {
    res.json(service.store.listAreas());
  });

  app.get('/api/inbox', (req, res) => {
    res.json(service.inbox(currentUser(service, req)));
  });

  app.get('/api/history', (req, res) => {
    res.json(service.history(currentUser(service, req)));
  });

  app.get('/api/requests/:id', (req, res) => {
    res.json(service.get(req.params.id));
  });

  app.post('/api/requests/:id/decision', async (req, res) => {
    const actorId = currentUser(service, req);
    const { decision, comment, confirmOverBudget } = req.body ?? {};
    if (decision !== 'approve' && decision !== 'reject') {
      throw new DomainError('INVALID_DECISION', 'decision deve ser "approve" ou "reject".');
    }
    res.json(
      await service.decide(req.params.id, actorId, {
        decision,
        comment: typeof comment === 'string' ? comment : undefined,
        confirmOverBudget: confirmOverBudget === true,
      }),
    );
  });

  app.put('/api/me/delegation', (req, res) => {
    const userId = currentUser(service, req);
    const { userId: delegateId, until } = req.body ?? {};
    if (typeof delegateId !== 'string' || typeof until !== 'string') {
      throw new DomainError('INVALID_DELEGATION', 'Informe userId e until.');
    }
    res.json(service.setDelegation(userId, { userId: delegateId, until }));
  });

  app.delete('/api/me/delegation', (req, res) => {
    res.json(service.setDelegation(currentUser(service, req), null));
  });

  app.post('/api/sync', async (_req, res) => {
    res.json(await service.sync());
  });

  app.post('/api/escalations/run', (_req, res) => {
    res.json({ escalated: service.escalateOverdue().map((r) => r.id) });
  });

  app.get('/api/dashboard', (_req, res) => {
    res.json(service.dashboard());
  });

  app.use('/api', (_req, _res, next) => {
    next(new DomainError('NOT_FOUND', 'Rota não encontrada.', 404));
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    const dir = opts.staticDir;
    app.use(express.static(dir));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile('index.html', { root: dir }));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ code: 'INVALID_JSON', message: 'JSON inválido.' });
      return;
    }
    console.error(err);
    res.status(500).json({ code: 'INTERNAL', message: 'Erro interno.' });
  });

  return app;
}
