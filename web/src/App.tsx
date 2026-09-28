import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApprovalCard } from './components/ApprovalCard';
import { ConfirmSheet } from './components/ConfirmSheet';
import { DashboardView } from './components/DashboardView';
import { ProfileView } from './components/ProfileView';
import { SwipeDeck, type SwipeDirection } from './components/SwipeDeck';
import { ApiError, api, type BudgetImpact, type Dashboard, type RequestView, type UserInfo } from './lib/api';
import { initials, money, pct } from './lib/format';

type Tab = 'inbox' | 'dashboard' | 'profile';

const STORAGE_KEY = 'fluxopro:user';

function readStoredUser(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function App() {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [meId, setMeId] = useState<string | null>(readStoredUser);
  const [tab, setTab] = useState<Tab>('inbox');
  const [inbox, setInbox] = useState<RequestView[] | null>(null);
  const [history, setHistory] = useState<RequestView[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [confirm, setConfirm] = useState<{ request: RequestView; budget: BudgetImpact } | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const me = meId ? userMap.get(meId) : undefined;

  const notify = (text: string, tone: 'ok' | 'error' = 'ok') => setToast({ text, tone });

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadUsers = useCallback(async () => {
    const list = await api.users();
    setUsers(list);
    setMeId((current) => (current && list.some((u) => u.id === current) ? current : list[0]?.id ?? null));
  }, []);

  const loadMine = useCallback(async () => {
    if (!meId) return;
    const [items, done] = await Promise.all([api.inbox(meId), api.history(meId)]);
    setInbox(items);
    setHistory(done);
  }, [meId]);

  const loadDashboard = useCallback(async () => setDashboard(await api.dashboard()), []);

  useEffect(() => {
    loadUsers().catch((e) => notify(e.message, 'error'));
  }, [loadUsers]);

  useEffect(() => {
    if (!meId) return;
    try {
      localStorage.setItem(STORAGE_KEY, meId);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
    setInbox(null);
    loadMine().catch((e) => notify(e.message, 'error'));
    const poll = window.setInterval(() => loadMine().catch(() => undefined), 30_000);
    return () => window.clearInterval(poll);
  }, [meId, loadMine]);

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard().catch((e) => notify(e.message, 'error'));
  }, [tab, loadDashboard]);

  async function decide(request: RequestView, decision: 'approve' | 'reject', confirmOverBudget = false) {
    if (!meId) return;
    setInbox((items) => items?.filter((r) => r.id !== request.id) ?? null);
    try {
      const result = await api.decide(meId, request.id, { decision, confirmOverBudget });
      if (result.status === 'rejected') notify(`Rejeitada · ${request.title}`);
      else if (result.status === 'approved') notify(`Aprovada · ${request.title}`);
      else notify(`Aprovada e encaminhada para ${result.currentApprover?.name ?? 'o próximo nível'}`);
      api.history(meId).then(setHistory).catch(() => undefined);
    } catch (err) {
      setInbox((items) => [request, ...(items ?? [])]);
      if (err instanceof ApiError && err.code === 'BUDGET_CONFIRMATION_REQUIRED') {
        setConfirm({ request, budget: err.details as BudgetImpact });
      } else {
        notify(err instanceof Error ? err.message : 'Falha ao registrar decisão', 'error');
        loadMine().catch(() => undefined);
      }
    }
  }

  function onSwipe(request: RequestView, direction: SwipeDirection) {
    if (direction === 'left') return void decide(request, 'reject');
    if (request.budget.exceeds) return setConfirm({ request, budget: request.budget });
    void decide(request, 'approve');
  }

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      notify(await action());
      await Promise.all([loadDashboard(), loadMine()]);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = inbox?.length ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⇄</span> FluxoPro
        </div>
        {me && (
          <label className="who">
            <span className="avatar">{initials(me.name)}</span>
            <select value={me.id} onChange={(e) => setMeId(e.target.value)} aria-label="Usuário">
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.role}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      <main>
        {tab === 'inbox' && (
          <>
            <div className="inbox-head">
              <h1>{pendingCount ? `${pendingCount} pendente${pendingCount > 1 ? 's' : ''}` : 'Caixa de aprovação'}</h1>
              <p className="muted small">Arraste → para aprovar, ← para rejeitar</p>
            </div>
            {inbox === null ? (
              <p className="empty">Carregando…</p>
            ) : inbox.length === 0 ? (
              <div className="empty">
                <div className="big">✓</div>
                <p>Tudo em dia. Nenhuma aprovação esperando por você.</p>
              </div>
            ) : (
              <SwipeDeck
                items={inbox}
                keyOf={(r) => r.id}
                render={(r) => <ApprovalCard request={r} users={userMap} />}
                onSwipe={onSwipe}
              />
            )}
          </>
        )}

        {tab === 'dashboard' && (
          <DashboardView
            data={dashboard}
            busy={busy}
            onSync={() =>
              run(async () => {
                const r = await api.sync();
                return r.errors.length
                  ? `${r.imported} importada(s); ${r.errors.length} erro(s)`
                  : `${r.imported} nova(s) solicitação(ões) importada(s)`;
              })
            }
            onEscalate={() =>
              run(async () => {
                const r = await api.escalate();
                return r.escalated.length
                  ? `${r.escalated.length} solicitação(ões) subiram de nível`
                  : 'Nenhuma solicitação fora do SLA para escalar';
              })
            }
          />
        )}

        {tab === 'profile' && me && (
          <ProfileView
            me={me}
            users={users}
            history={history}
            onDelegate={(delegateId, until) =>
              run(async () => {
                const r = await api.setDelegation(me.id, delegateId, until);
                await loadUsers();
                return `Delegação ativa; ${r.moved} pendência(s) transferida(s)`;
              })
            }
            onClearDelegation={() =>
              run(async () => {
                await api.clearDelegation(me.id);
                await loadUsers();
                return 'Delegação encerrada';
              })
            }
          />
        )}
      </main>

      <nav className="tabs">
        <button type="button" className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>
          Aprovar{pendingCount ? <span className="badge">{pendingCount}</span> : null}
        </button>
        <button type="button" className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          Painel
        </button>
        <button type="button" className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
          Perfil
        </button>
      </nav>

      {confirm && (
        <ConfirmSheet
          title="Estouro de orçamento"
          confirmLabel="Aprovar mesmo assim"
          tone="danger"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const { request } = confirm;
            setConfirm(null);
            void decide(request, 'approve', true);
          }}
        >
          <p className="sheet-lead">{confirm.budget.message}</p>
          <dl className="meta">
            <div>
              <dt>Solicitação</dt>
              <dd>{money(confirm.request.amountCents)}</dd>
            </div>
            <div>
              <dt>Orçamento {confirm.budget.areaName}</dt>
              <dd>{money(confirm.budget.limitCents)}</dd>
            </div>
            <div>
              <dt>Uso após aprovar</dt>
              <dd>{pct(confirm.budget.usageAfter)}</dd>
            </div>
          </dl>
          <p className="muted small">A aprovação fica registrada na trilha como ciente do estouro.</p>
        </ConfirmSheet>
      )}

      {toast && <div className={`toast toast-${toast.tone}`}>{toast.text}</div>}
    </div>
  );
}
