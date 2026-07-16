export function parseValorBR(raw: any): number {
  let str = String(raw ?? '').trim();
  str = str.replace(/^R\$\s*/, '').replace(/\s/g, '');
  // If has both dot and comma, figure out which is decimal separator
  if (str.includes(',') && str.includes('.')) {
    // Brazilian: 1.234,56
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    }
    // English: 1,234.56 — just remove commas
    else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    // Só ponto: decidir se é decimal (1.5) ou milhar brasileiro (1.500 / 1.234.567)
    const parts = str.split('.');
    const afterLast = parts[parts.length - 1];
    if (parts.length > 2 || (afterLast.length === 3 && parts[0].length <= 3)) {
      // "1.500" ou "1.234.567" → separador de milhar
      str = str.replace(/\./g, '');
    }
    // "1.5" ou "10.25" → decimal, mantém como está
  }
  return parseFloat(str);
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d <= daysInMonth;
}

export function parseDateFlexible(value: any): string {
  if (!value) return '';
  if (value instanceof Date) {
    // Usar componentes locais (toISOString converte para UTC e pode voltar 1 dia no fuso do Brasil)
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(value).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return isValidYMD(y, m, d) ? str : '';
  }
  // DD/MM/YYYY (padrão brasileiro)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/').map(Number);
    if (isValidYMD(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    // Dia impossível no formato BR (ex: 5/25/2026) → tentar como M/D/YYYY americano
    if (isValidYMD(y, d, m)) {
      return `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
    }
    return '';
  }
  // DD/MM/YY (ano com 2 dígitos)
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(str)) {
    const [dRaw, mRaw, yRaw] = str.split('/');
    const y = parseInt(yRaw) > 50 ? 1900 + parseInt(yRaw) : 2000 + parseInt(yRaw);
    const d = parseInt(dRaw);
    const m = parseInt(mRaw);
    if (isValidYMD(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    if (isValidYMD(y, d, m)) {
      return `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
    }
    return '';
  }
  return '';
}

/**
 * Auto-map expected field names to detected columns.
 * Uses fuzzy/alias matching.
 */
export function autoMapColumns(
  expectedColumns: string[],
  detectedHeaders: string[],
  aliases?: Record<string, string[]>
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const defaultAliases: Record<string, string[]> = {
    'Valor': ['Valor Real', 'Valor (R$)'],
    'Vendedor': ['Responsável', 'Responsavel'],
    'Tipo': ['Tipo (Fixo/Variável)', 'Tipo (Fixo/Variavel)'],
    'Status': ['Status/Pago'],
    'Descrição': ['Descricao', 'Descrição'],
    ...aliases,
  };

  for (const expected of expectedColumns) {
    // Exact match
    const exact = detectedHeaders.find(h => h.toLowerCase() === expected.toLowerCase());
    if (exact) { mapping[expected] = exact; continue; }
    // Alias match
    const aliasList = defaultAliases[expected] || [];
    const aliasMatch = detectedHeaders.find(h => aliasList.some(a => h.toLowerCase() === a.toLowerCase()));
    if (aliasMatch) { mapping[expected] = aliasMatch; continue; }
    // Partial match
    const partial = detectedHeaders.find(h => h.toLowerCase().includes(expected.toLowerCase()) || expected.toLowerCase().includes(h.toLowerCase()));
    if (partial) { mapping[expected] = partial; continue; }
    mapping[expected] = '';
  }
  return mapping;
}
