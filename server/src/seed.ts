import { ContaAzulConnector, type ContaAzulExpense } from './connectors/contaAzul.js';
import { SapConnector, type SapPurchaseRequisition } from './connectors/sap.js';
import { TotvsConnector, type TotvsRecord } from './connectors/totvs.js';
import type { Area, User } from './domain/types.js';

const K = 100; // cents per real

/**
 * Demo company: coordinators → directors → CEO.
 * Limits are in cents; null = unlimited; a missing type must be forwarded.
 */
export const demoUsers: User[] = [
  {
    id: 'ceo',
    name: 'Helena Prado',
    role: 'CEO',
    managerId: null,
    approvalLimits: { purchase: null, reimbursement: null, hiring: null, vacation: null },
  },
  {
    id: 'dir-ops',
    name: 'Ricardo Menezes',
    role: 'Diretor de Operações',
    managerId: 'ceo',
    approvalLimits: { purchase: 150_000 * K, reimbursement: 20_000 * K, hiring: 300_000 * K, vacation: null },
  },
  {
    id: 'dir-com',
    name: 'Fernanda Luz',
    role: 'Diretora Comercial',
    managerId: 'ceo',
    approvalLimits: { purchase: 100_000 * K, reimbursement: 20_000 * K, hiring: 250_000 * K, vacation: null },
  },
  {
    id: 'ger-ti',
    name: 'Bruno Tavares',
    role: 'Gerente de TI',
    managerId: 'dir-ops',
    approvalLimits: { purchase: 30_000 * K, reimbursement: 3_000 * K, vacation: null },
  },
  {
    id: 'ger-log',
    name: 'Camila Rocha',
    role: 'Gerente de Logística',
    managerId: 'dir-ops',
    approvalLimits: { purchase: 50_000 * K, reimbursement: 3_000 * K, vacation: null },
  },
  {
    id: 'ger-mkt',
    name: 'Diego Sampaio',
    role: 'Gerente de Marketing',
    managerId: 'dir-com',
    approvalLimits: { purchase: 20_000 * K, reimbursement: 5_000 * K, vacation: null },
  },
];

export const demoAreas: Area[] = [
  { id: 'ti', name: 'TI', approverId: 'ger-ti', budget: { period: '2026-T3', limitCents: 400_000 * K, committedCents: 372_000 * K } },
  { id: 'logistica', name: 'Logística', approverId: 'ger-log', budget: { period: '2026-T3', limitCents: 900_000 * K, committedCents: 510_000 * K } },
  { id: 'marketing', name: 'Marketing', approverId: 'ger-mkt', budget: { period: '2026-T3', limitCents: 250_000 * K, committedCents: 221_000 * K } },
  { id: 'comercial', name: 'Comercial', approverId: 'dir-com', budget: { period: '2026-T3', limitCents: 600_000 * K, committedCents: 300_000 * K } },
];

/** ERP cost center codes → FluxoPro areas. */
export const costCenters: Record<string, string> = {
  '1000-TI': 'ti',
  '2000-LOG': 'logistica',
  '3000-MKT': 'marketing',
  '4000-COM': 'comercial',
  '101': 'ti',
  '201': 'logistica',
  '301': 'marketing',
  '401': 'comercial',
  'CC-TI': 'ti',
  'CC-LOG': 'logistica',
  'CC-MKT': 'marketing',
  'CC-COM': 'comercial',
};

const sapRecords: SapPurchaseRequisition[] = [
  { BANFN: '0010004567', BNFPO: '00010', TXZ01: 'Notebooks Dell Latitude para squad de dados', MENGE: 6, PREIS: 8_900, PEINH: 1, WAERS: 'BRL', KOSTL: '1000-TI', AFNAM: 'Paula Nogueira', BADAT: '2026-09-25' },
  { BANFN: '0010004571', BNFPO: '00010', TXZ01: 'Empilhadeira elétrica 2,5t', MENGE: 1, PREIS: 142_000, PEINH: 1, WAERS: 'BRL', KOSTL: '2000-LOG', AFNAM: 'Marcos Lima', BADAT: '2026-09-26' },
  { BANFN: '0010004580', BNFPO: '00020', TXZ01: 'Licenças anuais de observabilidade', MENGE: 40, PREIS: 450, PEINH: 1, WAERS: 'BRL', KOSTL: '1000-TI', AFNAM: 'Paula Nogueira', BADAT: '2026-09-27' },
];

const totvsRecords: TotvsRecord[] = [
  { kind: 'SC1', C1_NUM: '004512', C1_ITEM: '0001', C1_DESCRI: 'Paletes PBR (lote)', C1_QUANT: 300, C1_VUNIT: 62.5, C1_CC: '201', C1_SOLICIT: 'Jéssica Alves', C1_EMISSAO: '20260926' },
  { kind: 'SC1', C1_NUM: '004519', C1_ITEM: '0001', C1_DESCRI: 'Estande para feira ExpoVarejo', C1_QUANT: 1, C1_VUNIT: 38_000, C1_CC: '301', C1_SOLICIT: 'Rafael Costa', C1_EMISSAO: '20260927' },
  { kind: 'SRH', RH_MAT: '000231', RA_NOME: 'Ana Beatriz Souza', RA_CC: '101', RH_DATAINI: '20261103', RH_DFERIAS: 20, RH_DTSOLIC: '20260924' },
  { kind: 'SQS', QS_VAGA: '000087', QS_DESCRIC: 'Executivo(a) de Contas Sênior', QS_CC: '401', QS_SOLICIT: 'Fernanda Luz', QS_SALARIO: 14_000, QS_NRVAGA: 2, QS_DTABERT: '20260925' },
];

const contaAzulRecords: ContaAzulExpense[] = [
  { id: 'ca-7f3a91', description: 'Viagem a cliente em Recife', value: 2_380.9, category: 'Viagens', cost_center: 'CC-COM', requester: { name: 'Thiago Martins' }, created_at: '2026-09-26T14:12:00-03:00', attachments: 4 },
  { id: 'ca-7f3b02', description: 'Almoço com parceiro de mídia', value: 412.5, category: 'Refeições', cost_center: 'CC-MKT', requester: { name: 'Rafael Costa' }, created_at: '2026-09-27T13:40:00-03:00', attachments: 1 },
  { id: 'ca-7f3b44', description: 'Curso de certificação AWS', value: 3_900, category: 'Treinamento', cost_center: 'CC-TI', requester: { name: 'Lucas Ferreira' }, created_at: '2026-09-27T09:05:00-03:00', attachments: 2 },
];

export function demoConnectors() {
  return [
    new SapConnector(structuredClone(sapRecords), costCenters),
    new TotvsConnector(structuredClone(totvsRecords), costCenters),
    new ContaAzulConnector(structuredClone(contaAzulRecords), costCenters),
  ];
}

/**
 * Makes the demo show the SLA in action: one request already blew the 48h
 * window (and escalates on the first scheduler run) and one is close to it.
 */
export function backdateDemo(
  store: { listRequests(): { externalId: string; assignedAt: string; createdAt: string; history: { at: string }[] }[] },
  now = new Date(),
) {
  const shift: Record<string, number> = { 'SC1-004519-0001': 50, 'ca-7f3a91': 41 };
  for (const r of store.listRequests()) {
    const hours = shift[r.externalId];
    if (!hours) continue;
    const at = new Date(now.getTime() - hours * 3_600_000).toISOString();
    r.assignedAt = at;
    r.history.forEach((h) => (h.at = at));
  }
}
