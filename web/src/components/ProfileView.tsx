import { useState } from 'react';
import type { RequestView, UserInfo } from '../lib/api';
import { TYPE_LABEL, dateTime, money } from '../lib/format';

interface Props {
  me: UserInfo;
  users: UserInfo[];
  history: RequestView[];
  onDelegate: (delegateId: string, until: string) => void;
  onClearDelegation: () => void;
}

function defaultUntil(): string {
  const d = new Date(Date.now() + 7 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const STATUS: Record<RequestView['status'], string> = {
  pending: 'Em andamento',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
};

export function ProfileView({ me, users, history, onDelegate, onClearDelegation }: Props) {
  const others = users.filter((u) => u.id !== me.id);
  const [delegateId, setDelegateId] = useState(others[0]?.id ?? '');
  const [until, setUntil] = useState(defaultUntil);
  const delegate = me.delegation && users.find((u) => u.id === me.delegation!.userId);

  return (
    <section className="profile">
      <h3>Ausência e delegação</h3>
      {me.delegation ? (
        <div className="panel">
          <p>
            Suas aprovações estão com <strong>{delegate?.name ?? me.delegation.userId}</strong> até{' '}
            {dateTime(me.delegation.until)}.
          </p>
          <button type="button" className="btn ghost" onClick={onClearDelegation}>
            Encerrar delegação
          </button>
        </div>
      ) : (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            onDelegate(delegateId, new Date(`${until}T23:59:59`).toISOString());
          }}
        >
          <label>
            Substituto
            <select value={delegateId} onChange={(e) => setDelegateId(e.target.value)}>
              {others.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.role}
                </option>
              ))}
            </select>
          </label>
          <label>
            Até
            <input type="date" value={until} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} />
          </label>
          <button type="submit" className="btn primary">
            Delegar minhas aprovações
          </button>
          <p className="muted small">
            Sem delegação, o que ficar parado mais de 48h sobe automaticamente para o seu nível superior.
          </p>
        </form>
      )}

      <h3>Suas decisões recentes</h3>
      {history.length === 0 ? (
        <p className="muted">Nenhuma decisão ainda.</p>
      ) : (
        <ul className="history">
          {history.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <small>
                  {TYPE_LABEL[r.type]} · {r.type === 'vacation' ? `${r.metadata?.dias ?? ''} dias` : money(r.amountCents)}
                </small>
              </div>
              <span className={`status status-${r.status}`}>
                {STATUS[r.status]}
                {r.status === 'pending' && r.currentApprover ? ` · com ${r.currentApprover.name}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
