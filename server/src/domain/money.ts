const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: number): string {
  // Intl uses a non-breaking space after "R$"; normalise it so messages are predictable.
  return brl.format(cents / 100).replace(/ /g, ' ');
}

export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString('pt-BR')}%`;
}
