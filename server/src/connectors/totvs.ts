import { toCents } from '../domain/money.js';
import type { IncomingRequest } from '../domain/types.js';
import { MockConnector } from './mockConnector.js';

/** Protheus dates come as YYYYMMDD strings. */
function protheusDate(value: string): string {
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`).toISOString();
}

/** Solicitação de compra (SC1). */
export interface TotvsPurchaseRequest {
  kind: 'SC1';
  C1_NUM: string;
  C1_ITEM: string;
  C1_DESCRI: string;
  C1_QUANT: number;
  C1_VUNIT: number;
  C1_CC: string;
  C1_SOLICIT: string;
  C1_EMISSAO: string;
}

/** Programação de férias (SRH). */
export interface TotvsVacationRequest {
  kind: 'SRH';
  RH_MAT: string;
  RA_NOME: string;
  RA_CC: string;
  RH_DATAINI: string;
  RH_DFERIAS: number;
  RH_DTSOLIC: string;
}

/** Requisição de vaga (SQS). */
export interface TotvsHiringRequest {
  kind: 'SQS';
  QS_VAGA: string;
  QS_DESCRIC: string;
  QS_CC: string;
  QS_SOLICIT: string;
  QS_SALARIO: number;
  QS_NRVAGA: number;
  QS_DTABERT: string;
}

export type TotvsRecord = TotvsPurchaseRequest | TotvsVacationRequest | TotvsHiringRequest;

/** Monthly salary × 12 + 13º salário + 1/3 de férias. */
export const ANNUAL_SALARY_FACTOR = 13 + 1 / 3;

export class TotvsConnector extends MockConnector<TotvsRecord> {
  readonly source = 'totvs' as const;
  readonly label = 'TOTVS Protheus';

  protected toIncoming(r: TotvsRecord): IncomingRequest {
    switch (r.kind) {
      case 'SC1':
        return {
          source: this.source,
          externalId: `SC1-${r.C1_NUM}-${r.C1_ITEM}`,
          type: 'purchase',
          title: r.C1_DESCRI,
          description: `Solicitação de compra ${r.C1_NUM}: ${r.C1_QUANT} × item ${r.C1_ITEM}.`,
          requesterName: r.C1_SOLICIT,
          areaId: this.area(r.C1_CC),
          amountCents: toCents(r.C1_QUANT * r.C1_VUNIT),
          createdAt: protheusDate(r.C1_EMISSAO),
          metadata: { quantidade: r.C1_QUANT, centroDeCusto: r.C1_CC },
        };
      case 'SRH':
        return {
          source: this.source,
          externalId: `SRH-${r.RH_MAT}-${r.RH_DATAINI}`,
          type: 'vacation',
          title: `Férias de ${r.RA_NOME}`,
          description: `${r.RH_DFERIAS} dias a partir de ${protheusDate(r.RH_DATAINI).slice(0, 10)}.`,
          requesterName: r.RA_NOME,
          areaId: this.area(r.RA_CC),
          amountCents: 0,
          createdAt: protheusDate(r.RH_DTSOLIC),
          metadata: { matricula: r.RH_MAT, dias: r.RH_DFERIAS, inicio: protheusDate(r.RH_DATAINI).slice(0, 10) },
        };
      case 'SQS':
        return {
          source: this.source,
          externalId: `SQS-${r.QS_VAGA}`,
          type: 'hiring',
          title: `Contratação: ${r.QS_DESCRIC}`,
          description: `${r.QS_NRVAGA} vaga(s); custo anual estimado com encargos de 13º e férias.`,
          requesterName: r.QS_SOLICIT,
          areaId: this.area(r.QS_CC),
          amountCents: toCents(r.QS_SALARIO * ANNUAL_SALARY_FACTOR * r.QS_NRVAGA),
          createdAt: protheusDate(r.QS_DTABERT),
          metadata: { vagas: r.QS_NRVAGA, salarioMensal: r.QS_SALARIO, centroDeCusto: r.QS_CC },
        };
    }
  }
}
