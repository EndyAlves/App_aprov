import type { Dashboard } from '../lib/api';
import { SOURCE_LABEL, TYPE_LABEL, moneyCompact } from '../lib/format';

interface Props {
  data: Dashboard | null;
  busy: boolean;
  onSync: () => void;
  onEscalate: () => void;
}

function Bars<K extends string>({ data, labels }: { data: Partial<Record<K, number>>; labels: Record<K, string> }) {
  const entries = Object.entries(data) as [K, number][];
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p className="muted">Nada pendente.</p>;
  return (
    <ul className="bars">
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => (
          <li key={k}>
            <span>{labels[k]}</span>
            <span className="bar">
              <span style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <strong>{v}</strong>
          </li>
        ))}
    </ul>
  );
}

export function DashboardView({ data, busy, onSync, onEscalate }: Props) {
  if (!data) return <p className="empty">Carregando…</p>;
  const { totals } = data;
  return (
    <section className="dashboard">
      <div className="kpis">
        <div className="kpi">
          <span>Pendentes</span>
          <strong>{totals.pending}</strong>
          <small>{moneyCompact(data.pendingAmountCents)}</small>
        </div>
        <div className={`kpi ${totals.overdue ? 'kpi-alert' : ''}`}>
          <span>Fora do SLA</span>
          <strong>{totals.overdue}</strong>
          <small>{data.escalations} escalonamento(s)</small>
        </div>
        <div className="kpi">
          <span>Decididas</span>
          <strong>{totals.approved + totals.rejected}</strong>
          <small>
            {totals.approved} ✓ · {totals.rejected} ✕
          </small>
        </div>
        <div className="kpi">
          <span>Tempo médio</span>
          <strong>{data.avgDecisionHours === null ? '—' : `${data.avgDecisionHours.toLocaleString('pt-BR')}h`}</strong>
          <small>da entrada à decisão</small>
        </div>
      </div>

      <h3>Gargalos por aprovador</h3>
      {data.bottlenecks.length === 0 ? (
        <p className="muted">Nenhuma fila parada. 🎉</p>
      ) : (
        <table className="bottlenecks">
          <thead>
            <tr>
              <th>Aprovador</th>
              <th>Fila</th>
              <th>Vencidas</th>
              <th>Mais antiga</th>
            </tr>
          </thead>
          <tbody>
            {data.bottlenecks.map((b) => (
              <tr key={b.user.id} className={b.overdue ? 'row-alert' : ''}>
                <td>
                  {b.user.name}
                  <small>{b.user.role}</small>
                </td>
                <td>{b.pending}</td>
                <td>{b.overdue}</td>
                <td>{b.oldestHours.toLocaleString('pt-BR')}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="split">
        <div>
          <h3>Por origem</h3>
          <Bars data={data.pendingBySource} labels={SOURCE_LABEL} />
        </div>
        <div>
          <h3>Por tipo</h3>
          <Bars data={data.pendingByType} labels={TYPE_LABEL} />
        </div>
      </div>

      <div className="ops">
        <button type="button" className="btn ghost" disabled={busy} onClick={onSync}>
          Sincronizar ERPs
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onEscalate}>
          Rodar escalonamento
        </button>
      </div>
    </section>
  );
}
