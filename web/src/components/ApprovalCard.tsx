import { useState } from 'react';
import type { RequestView, UserInfo } from '../lib/api';
import { ACTION_LABEL, SOURCE_LABEL, TYPE_LABEL, dateTime, hoursUntil, money, pct, slaLabel } from '../lib/format';

interface Props {
  request: RequestView;
  users: Map<string, UserInfo>;
}

function BudgetBar({ request }: { request: RequestView }) {
  const b = request.budget;
  if (b.severity === 'none') return <p className="budget budget-none">{b.message}</p>;
  const before = Math.min(b.usageBefore, 1);
  const after = Math.min(b.usageAfter, 1);
  return (
    <div className={`budget budget-${b.severity}`}>
      <div className="budget-bar" aria-hidden>
        <span className="budget-used" style={{ width: `${before * 100}%` }} />
        <span className="budget-new" style={{ left: `${before * 100}%`, width: `${(after - before) * 100}%` }} />
      </div>
      <div className="budget-legend">
        <span>
          {b.areaName}: {pct(b.usageBefore)} → <strong>{pct(b.usageAfter)}</strong>
        </span>
        <span>limite {money(b.limitCents)}</span>
      </div>
      <p>{b.message}</p>
    </div>
  );
}

export function ApprovalCard({ request, users }: Props) {
  const [showTrail, setShowTrail] = useState(false);
  const hoursLeft = hoursUntil(request.slaDeadline);
  const sla = request.overdue ? 'sla-overdue' : hoursLeft < 12 ? 'sla-soon' : 'sla-ok';
  const days = request.metadata?.dias;
  const name = (id?: string | null) => (id ? users.get(id)?.name ?? id : 'Sistema');

  return (
    <article className="card-body">
      <header className="chips">
        <span className={`chip chip-${request.type}`}>{TYPE_LABEL[request.type]}</span>
        <span className="chip chip-source">{SOURCE_LABEL[request.source]}</span>
        <span className={`chip ${sla}`}>{slaLabel(request.slaDeadline)}</span>
        {request.escalations > 0 && <span className="chip chip-escalated">↑ escalado {request.escalations}×</span>}
      </header>

      <h2>{request.title}</h2>
      <p className="muted">
        {request.requesterName} · {request.budget.areaName} · {request.id}
      </p>

      <div className="amount">{request.type === 'vacation' ? `${days ?? '—'} dias` : money(request.amountCents)}</div>

      <BudgetBar request={request} />

      {request.forwardsTo && (
        <p className="forward">
          Acima da sua alçada: ao aprovar, segue para <strong>{request.forwardsTo.name}</strong> (
          {request.forwardsTo.role}).
        </p>
      )}

      <p className="description">{request.description}</p>

      {request.metadata && (
        <dl className="meta">
          {Object.entries(request.metadata).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      <button
        type="button"
        className="link"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setShowTrail((s) => !s)}
      >
        {showTrail ? 'Ocultar trilha' : `Ver trilha (${request.history.length})`}
      </button>
      {showTrail && (
        <ol className="trail">
          {request.history.map((h, i) => (
            <li key={i}>
              <strong>{ACTION_LABEL[h.action]}</strong> · {dateTime(h.at)}
              <br />
              <span className="muted">
                {h.action === 'created' ? `para ${name(h.toUserId)}` : name(h.actorId)}
                {h.toUserId && h.action !== 'created' ? ` → ${name(h.toUserId)}` : ''}
                {h.note ? ` — ${h.note}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
