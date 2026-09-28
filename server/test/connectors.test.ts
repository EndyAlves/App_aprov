import { describe, expect, it } from 'vitest';
import { demoConnectors } from '../src/seed.js';

describe('ERP connectors', () => {
  it('normalise native SAP, TOTVS and Conta Azul payloads', async () => {
    const [sap, totvs, contaAzul] = demoConnectors();

    const sapItems = await sap.fetchPending();
    expect(sapItems[0]).toMatchObject({
      source: 'sap',
      externalId: '0010004567/00010',
      type: 'purchase',
      areaId: 'ti',
      amountCents: 53_400_00,
    });

    const totvsItems = await totvs.fetchPending();
    expect(totvsItems.map((i) => i.type)).toEqual(['purchase', 'purchase', 'vacation', 'hiring']);
    expect(totvsItems[0].amountCents).toBe(18_750_00);
    expect(totvsItems[2]).toMatchObject({ amountCents: 0, areaId: 'ti', createdAt: '2026-09-24T00:00:00.000Z' });
    expect(totvsItems[3].amountCents).toBe(373_333_33);

    const caItems = await contaAzul.fetchPending();
    expect(caItems[0]).toMatchObject({ type: 'reimbursement', areaId: 'comercial', amountCents: 2_380_90 });
  });
});
