import type { HistoryEntry, RequestType, SourceSystem } from './api';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const compact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' });

export const money = (cents: number) => brl.format(cents / 100);
export const moneyCompact = (cents: number) => compact.format(cents / 100);

export const TYPE_LABEL: Record<RequestType, string> = {
  purchase: 'Compra',
  reimbursement: 'Reembolso',
  hiring: 'Contratação',
  vacation: 'Férias',
};

export const SOURCE_LABEL: Record<SourceSystem, string> = {
  sap: 'SAP',
  totvs: 'TOTVS',
  contaazul: 'Conta Azul',
  manual: 'Manual',
};

export const ACTION_LABEL: Record<HistoryEntry['action'], string> = {
  created: 'Recebido',
  approved: 'Aprovado',
  forwarded: 'Aprovado e encaminhado',
  rejected: 'Rejeitado',
  escalated: 'Escalonado automaticamente',
  delegated: 'Delegado',
};

export function hoursUntil(iso: string, now = Date.now()): number {
  return (new Date(iso).getTime() - now) / 3_600_000;
}

export function slaLabel(deadline: string): string {
  const h = hoursUntil(deadline);
  if (h <= 0) return 'Prazo vencido';
  if (h < 1) return `Escala em ${Math.max(1, Math.round(h * 60))} min`;
  return `Escala em ${Math.round(h)}h`;
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export const pct = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`.replace('.', ',');

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
